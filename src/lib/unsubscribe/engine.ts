import "server-only";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import {
  senders,
  unsubscribeAttempts,
  type MailAccount,
  type Sender,
} from "@/db/schema";
import { getProviderForAccount, type MailProvider } from "@/lib/mail";
import { findUnsubscribeLinkInBody } from "@/lib/mail/headers";
import { safeFetch } from "./safe-fetch";
import { pageConfirmsUnsubscribe } from "./confirmation";
import {
  ATTEMPT_STATUS,
  PROTECTED_UNSUBSCRIBE_STATUSES,
  SENDER_STATUS,
  UNSUBSCRIBE_METHOD,
  type AttemptStatus,
  type SenderStatus,
  type UnsubscribeMethod,
} from "@/lib/constants";

/**
 * The unsubscribe engine.
 *
 * Senders advertise several ways to leave a list and they vary wildly in
 * reliability, so we try them in order of how certain the outcome is:
 *
 *   1. ONE_CLICK  (RFC 8058)  a single POST. The standard guarantees no
 *                             further action is needed, so this is a real,
 *                             confirmed unsubscribe.
 *   2. HTTP                   visit the link. Often enough on its own, but
 *                             plenty of senders show a confirmation page we
 *                             cannot click, so we read the response and only
 *                             claim success when the page says so.
 *   3. MAILTO                 send the unsubscribe email from your address.
 *                             Records a sent request, not confirmed removal.
 *   4. BODY_LINK              no headers at all: scrape a link out of the last
 *                             message and treat it like HTTP.
 *
 * Every attempt is written to unsubscribe_attempts, successes and failures
 * alike, so a sender that did not work is debuggable rather than mysterious.
 */

export type UnsubscribeOutcome = {
  senderId: string;
  status: SenderStatus;
  method: UnsubscribeMethod | null;
  /** Set when the user has to finish the job themselves. */
  manualUrl: string | null;
  detail: string;
};

type AttemptResult = {
  method: UnsubscribeMethod;
  status: AttemptStatus;
  detail: string;
  manualUrl?: string;
};

export async function unsubscribeSender(
  account: MailAccount,
  sender: Sender,
  /** Injectable for tests; in production the account decides the provider. */
  mailProvider?: MailProvider,
): Promise<UnsubscribeOutcome> {
  // Claim the sender before doing anything. Two requests can arrive at once —
  // a double click, or a row that is also part of a bulk selection — and
  // checking the status and then writing it would let both through. A single
  // conditional UPDATE is atomic, so exactly one of them can win.
  if (!(await claimForUnsubscribe(sender.id))) {
    return await alreadyHandled(sender.id);
  }

  const attempts: AttemptResult[] = [];

  try {
    for (const method of planMethods(sender)) {
      const result = await runMethod(account, sender, method, mailProvider);
      if (!result) continue;

      attempts.push(result);
      await recordAttempt(sender.id, result);

      if (result.status === ATTEMPT_STATUS.SUCCESS) {
        return await finish(sender.id, SENDER_STATUS.UNSUBSCRIBED, result);
      }
      if (result.status === ATTEMPT_STATUS.SENT) {
        return await finish(sender.id, SENDER_STATUS.REQUESTED, result);
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const result: AttemptResult = {
      method: UNSUBSCRIBE_METHOD.HTTP,
      status: ATTEMPT_STATUS.FAILED,
      detail: detail.slice(0, 300),
    };
    attempts.push(result);
    await recordAttempt(sender.id, result);
  }

  // Nothing succeeded outright. If any method left the user a link to finish,
  // that is a better outcome than a flat failure.
  const manual = attempts.find((a) => a.status === ATTEMPT_STATUS.MANUAL_REQUIRED);
  if (manual) return await finish(sender.id, SENDER_STATUS.MANUAL, manual);

  const last = attempts.at(-1);
  return await finish(
    sender.id,
    SENDER_STATUS.FAILED,
    last ?? {
      method: UNSUBSCRIBE_METHOD.HTTP,
      status: ATTEMPT_STATUS.FAILED,
      detail: "This sender publishes no unsubscribe method we can use.",
    },
  );
}

/** Which methods are worth trying for this sender, best first. */
function planMethods(sender: Sender): UnsubscribeMethod[] {
  const methods: UnsubscribeMethod[] = [];
  if (sender.oneClick && sender.unsubscribeHttp) {
    methods.push(UNSUBSCRIBE_METHOD.ONE_CLICK);
  }
  if (sender.unsubscribeHttp) methods.push(UNSUBSCRIBE_METHOD.HTTP);
  if (sender.unsubscribeMailto) methods.push(UNSUBSCRIBE_METHOD.MAILTO);
  if (!sender.unsubscribeHttp && sender.sampleMessageId) {
    methods.push(UNSUBSCRIBE_METHOD.BODY_LINK);
  }
  return methods;
}

async function runMethod(
  account: MailAccount,
  sender: Sender,
  method: UnsubscribeMethod,
  mailProvider?: MailProvider,
): Promise<AttemptResult | null> {
  switch (method) {
    case UNSUBSCRIBE_METHOD.ONE_CLICK:
      return oneClick(sender.unsubscribeHttp!);

    case UNSUBSCRIBE_METHOD.HTTP:
      return visitLink(sender.unsubscribeHttp!, UNSUBSCRIBE_METHOD.HTTP);

    case UNSUBSCRIBE_METHOD.MAILTO:
      return sendMailto(account, sender.unsubscribeMailto!, mailProvider);

    case UNSUBSCRIBE_METHOD.BODY_LINK: {
      const provider = mailProvider ?? (await getProviderForAccount(account));
      const html = await provider.getMessageHtml(sender.sampleMessageId!);
      const link = html ? findUnsubscribeLinkInBody(html) : null;
      if (!link) {
        return {
          method,
          status: ATTEMPT_STATUS.FAILED,
          detail: "No unsubscribe link found in the most recent message.",
        };
      }
      return visitLink(link, UNSUBSCRIBE_METHOD.BODY_LINK);
    }
  }
}

/**
 * RFC 8058 one-click.
 *
 * A POST with this exact body is defined to complete the unsubscribe with no
 * confirmation page, which is why a 2xx here counts as a real success.
 */
async function oneClick(url: string): Promise<AttemptResult> {
  try {
    const response = await safeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        method: UNSUBSCRIBE_METHOD.ONE_CLICK,
        status: ATTEMPT_STATUS.SUCCESS,
        detail: `One-click unsubscribe accepted (HTTP ${response.status}).`,
      };
    }

    return {
      method: UNSUBSCRIBE_METHOD.ONE_CLICK,
      status: ATTEMPT_STATUS.FAILED,
      detail: `One-click endpoint returned HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      method: UNSUBSCRIBE_METHOD.ONE_CLICK,
      status: ATTEMPT_STATUS.FAILED,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Visits a plain unsubscribe link.
 *
 * We cannot click buttons, so success is only claimed when the returned page
 * actually says the unsubscribe went through. Anything else is handed back to
 * the user as a link to finish, which is honest rather than optimistic.
 */
async function visitLink(
  url: string,
  method: UnsubscribeMethod,
): Promise<AttemptResult> {
  try {
    const response = await safeFetch(url, { method: "GET" });

    if (response.status < 200 || response.status >= 400) {
      return {
        method,
        status: ATTEMPT_STATUS.MANUAL_REQUIRED,
        detail: `The unsubscribe page returned HTTP ${response.status}. Open it yourself to finish.`,
        manualUrl: response.finalUrl,
      };
    }

    if (pageConfirmsUnsubscribe(response.body)) {
      return {
        method,
        status: ATTEMPT_STATUS.SUCCESS,
        detail: "The unsubscribe page confirmed you were removed.",
      };
    }

    return {
      method,
      status: ATTEMPT_STATUS.MANUAL_REQUIRED,
      detail: "Opened the unsubscribe page, but it needs one more click.",
      manualUrl: response.finalUrl,
    };
  } catch (error) {
    return {
      method,
      status: ATTEMPT_STATUS.MANUAL_REQUIRED,
      detail: error instanceof Error ? error.message : String(error),
      manualUrl: url,
    };
  }
}

/** Sends the unsubscribe email from the user's own mailbox. */
async function sendMailto(
  account: MailAccount,
  to: string,
  mailProvider?: MailProvider,
): Promise<AttemptResult> {
  try {
    const provider = mailProvider ?? (await getProviderForAccount(account));
    await provider.sendMail({
      to,
      subject: "unsubscribe",
      body: "Please unsubscribe this address from your mailing list.",
    });
    return {
      method: UNSUBSCRIBE_METHOD.MAILTO,
      status: ATTEMPT_STATUS.SENT,
      detail: `Unsubscribe email sent to ${to}. Removal is not confirmed; this list may still send emails.`,
    };
  } catch (error) {
    return {
      method: UNSUBSCRIBE_METHOD.MAILTO,
      status: ATTEMPT_STATUS.FAILED,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

// --- Persistence ------------------------------------------------------------

async function recordAttempt(senderId: string, result: AttemptResult): Promise<void> {
  await db.insert(unsubscribeAttempts).values({
    senderId,
    method: result.method,
    status: result.status,
    detail: (result.manualUrl ?? result.detail).slice(0, 500),
  });
}

async function finish(
  senderId: string,
  status: SenderStatus,
  result: AttemptResult,
): Promise<UnsubscribeOutcome> {
  await db
    .update(senders)
    .set({ status, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(senders.id, senderId));

  return {
    senderId,
    status,
    method: result.method,
    manualUrl: result.manualUrl ?? null,
    detail: result.detail,
  };
}

/**
 * Marks the sender as in progress, but only if nobody else already has.
 *
 * Returns true when this call is the one that claimed it.
 */
async function claimForUnsubscribe(senderId: string): Promise<boolean> {
  const claimed = await db
    .update(senders)
    .set({ status: SENDER_STATUS.UNSUBSCRIBING, updatedAt: new Date() })
    .where(
      and(
        eq(senders.id, senderId),
        notInArray(senders.status, PROTECTED_UNSUBSCRIBE_STATUSES),
      ),
    )
    .returning({ id: senders.id });

  return claimed.length === 1;
}

/**
 * What to report when the claim was lost.
 *
 * Reads the sender back rather than guessing, so the caller sees the real
 * current state: still running, or already finished by the request that won.
 */
async function alreadyHandled(senderId: string): Promise<UnsubscribeOutcome> {
  const [current] = await db
    .select()
    .from(senders)
    .where(eq(senders.id, senderId))
    .limit(1);

  const status = current?.status ?? SENDER_STATUS.UNSUBSCRIBING;

  return {
    senderId,
    status,
    method: null,
    manualUrl: null,
    detail:
      status === SENDER_STATUS.UNSUBSCRIBED
        ? "Already unsubscribed from this sender."
        : status === SENDER_STATUS.REQUESTED
          ? "An unsubscribe email has already been sent. Removal is not confirmed."
          : "An unsubscribe is already running for this sender.",
  };
}
