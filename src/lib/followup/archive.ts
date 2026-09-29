import type { ArchiveItemDto } from "@/lib/api/types";
import type { Observation } from "./match";

/**
 * Turning an observation into what the Unsubscribed page receives.
 *
 * Shared by the API and the demo so both describe the same facts the same way.
 */

/** How many later messages one row lists; the count covers the rest. */
export const FOLLOW_UP_MESSAGE_LIMIT = 5;

export function toArchiveItem(input: {
  senderId: string;
  name: string | null;
  address: string;
  unsubscribedAt: Date | null;
  observation: Observation;
  /** Builds a link to one message, or returns null when none is reliable. */
  messageUrl: (messageId: string) => string | null;
  unsubscribeHttp: string | null;
}): ArchiveItemDto {
  const { observation } = input;

  return {
    senderId: input.senderId,
    name: input.name,
    address: input.address,
    unsubscribedAt: input.unsubscribedAt?.toISOString() ?? null,
    observation: observation.state,
    notCheckedReason: observation.reason,
    matchedBy: observation.matchedBy,
    newMessages: observation.messages.slice(0, FOLLOW_UP_MESSAGE_LIMIT).map((message) => ({
      id: message.id,
      subject: message.subject,
      receivedAt: message.receivedAt!.toISOString(),
      gmailUrl: input.messageUrl(message.id),
    })),
    newCount: observation.messages.length,
    check: observation.check
      ? {
          at: observation.check.at.toISOString(),
          from: observation.check.from.toISOString(),
          to: observation.check.to.toISOString(),
          partial: observation.check.partial,
          found: observation.check.found,
        }
      : null,
    unsubscribePageUrl: httpsOnly(input.unsubscribeHttp),
  };
}

function httpsOnly(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * A link that opens one message in Gmail's web app.
 *
 * Gmail API message IDs are the same hexadecimal IDs the web app uses in its
 * `#all/<id>` route, and `authuser` picks the right account when several are
 * signed in. No other provider is supported, so anything else gets no link.
 */
export function gmailMessageUrl(provider: string, accountEmail: string, messageId: string): string | null {
  if (provider !== "gmail" || !/^[0-9a-f]+$/i.test(messageId)) return null;
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#all/${messageId}`;
}
