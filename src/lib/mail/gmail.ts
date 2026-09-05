import "server-only";
import type {
  ListOptions,
  MailProvider,
  MessageHeaders,
  MessagePage,
  SendMailOptions,
} from "./provider";
import { SCAN_CONCURRENCY } from "@/lib/constants";

/**
 * Gmail implementation of MailProvider, using the REST API directly.
 *
 * Why raw fetch instead of the googleapis SDK: the SDK is a very large
 * dependency and we need exactly three endpoints. This way the requests, the
 * quota cost and the retry behaviour are all visible in one file.
 *
 * Gmail quota: 250 units per user per second. messages.list and messages.get
 * cost 5 units each, so a chunk of 100 messages costs ~505 units. We cap
 * parallelism and back off on 429 rather than trying to be clever.
 */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Headers we ask Gmail for. Fetching metadata only is far cheaper than full. */
const METADATA_HEADERS = [
  "From",
  "Subject",
  "Date",
  "List-Unsubscribe",
  "List-Unsubscribe-Post",
  "List-Id",
  "Precedence",
];

export class GmailProvider implements MailProvider {
  readonly name = "gmail";

  constructor(
    readonly address: string,
    private readonly accessToken: string,
  ) {}

  async listSubscriptionMessages(options: ListOptions): Promise<MessagePage> {
    const params = new URLSearchParams({
      q: buildQuery(options.lookbackDays),
      maxResults: String(options.pageSize),
    });
    if (options.pageToken) params.set("pageToken", options.pageToken);

    const list = await this.request<{
      messages?: { id: string }[];
      nextPageToken?: string;
      resultSizeEstimate?: number;
    }>(`/messages?${params.toString()}`);

    const ids = (list.messages ?? []).map((m) => m.id);

    const messages = await mapWithConcurrency(ids, SCAN_CONCURRENCY, (id) =>
      this.getMessageHeaders(id),
    );

    return {
      messages: messages.filter((m): m is MessageHeaders => m !== null),
      nextPageToken: list.nextPageToken ?? null,
      totalEstimate: list.resultSizeEstimate ?? 0,
    };
  }

  private async getMessageHeaders(id: string): Promise<MessageHeaders | null> {
    const params = new URLSearchParams({ format: "metadata" });
    for (const h of METADATA_HEADERS) params.append("metadataHeaders", h);

    try {
      const message = await this.request<{
        id: string;
        internalDate?: string;
        payload?: { headers?: { name: string; value: string }[] };
      }>(`/messages/${id}?${params.toString()}`);

      const headers = new Map<string, string>();
      for (const h of message.payload?.headers ?? []) {
        headers.set(h.name.toLowerCase(), h.value);
      }

      const internal = message.internalDate ? Number(message.internalDate) : NaN;

      return {
        id: message.id,
        from: headers.get("from") ?? null,
        subject: headers.get("subject") ?? null,
        date: Number.isFinite(internal) ? new Date(internal) : null,
        listUnsubscribe: headers.get("list-unsubscribe") ?? null,
        listUnsubscribePost: headers.get("list-unsubscribe-post") ?? null,
        listId: headers.get("list-id") ?? null,
        precedence: headers.get("precedence") ?? null,
      };
    } catch {
      // One unreadable message must never abort a scan of thousands.
      return null;
    }
  }

  async getMessageHtml(messageId: string): Promise<string | null> {
    try {
      const message = await this.request<{ payload?: GmailPart }>(
        `/messages/${messageId}?format=full`,
      );
      if (!message.payload) return null;
      return findHtmlPart(message.payload);
    } catch {
      return null;
    }
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const mime = [
      `From: ${this.address}`,
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      options.body,
    ].join("\r\n");

    await this.request("/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: base64UrlEncode(mime) }),
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * One HTTP call to Gmail, with retries for the failures that are worth
   * retrying: rate limits and transient server errors.
   */
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(`${API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(init.headers ?? {}),
        },
        cache: "no-store",
      });

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }

      const retryable =
        response.status === 429 || (response.status >= 500 && response.status < 600);

      if (!retryable || attempt === maxAttempts) {
        const body = await response.text().catch(() => "");
        throw new GmailApiError(
          `Gmail API ${response.status} on ${path}: ${body.slice(0, 300)}`,
          response.status,
        );
      }

      // Exponential backoff with jitter: 250ms, 500ms, 1s (plus up to 250ms).
      const delay = 250 * 2 ** (attempt - 1) + Math.random() * 250;
      await sleep(delay);
    }

    throw new GmailApiError("Gmail request failed after retries", 0);
  }
}

export class GmailApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

/**
 * The Gmail search query for a scan.
 *
 * We deliberately do not fetch the whole mailbox. Marketing mail almost always
 * contains the word "unsubscribe" or sits in the Promotions/Updates tabs, so
 * this narrows thousands of messages down to the plausible ones. Whatever
 * survives is then filtered properly by header, in the scan engine.
 */
export function buildQuery(lookbackDays: number): string {
  return [
    `newer_than:${lookbackDays}d`,
    "-in:chats",
    "-in:sent",
    "-in:drafts",
    '(unsubscribe OR "opt out" OR category:promotions OR category:updates OR category:forums)',
  ].join(" ");
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};

/** Walks a MIME tree and returns the first text/html body it finds. */
function findHtmlPart(part: GmailPart): string | null {
  if (part.mimeType === "text/html" && part.body?.data) {
    return base64UrlDecode(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = findHtmlPart(child);
    if (found) return found;
  }
  // No HTML alternative — fall back to plain text, which may still hold a link.
  if (part.mimeType === "text/plain" && part.body?.data) {
    return base64UrlDecode(part.body.data);
  }
  return null;
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `worker` over `items` with a fixed number of parallel slots.
 *
 * Results come back in the same order as the input, which matters because the
 * scan engine pairs them up with message ids.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}
