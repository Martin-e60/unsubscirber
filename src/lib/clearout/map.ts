import type { ClearOutMessageDto, ClearOutPreviewDto } from "@/lib/api/types";
import { parseFromHeader, decodeMimeWords } from "@/lib/mail/headers";
import type { MessageMetadata } from "@/lib/mail/provider";
import { gmailMessageUrl } from "@/lib/followup/archive";

/**
 * Turning a message's metadata into a Clear out row.
 *
 * Pure, so tests can feed it the shapes Gmail actually returns. Only headers
 * and Gmail's own snippet are read — never a body, never an attachment.
 */

/** Headers a row needs. Content-Type tells whether attachments were built in. */
export const LIST_HEADERS = ["From", "To", "Subject", "Content-Type"];
export const PREVIEW_HEADERS = [...LIST_HEADERS, "Cc"];

/** Gmail escapes its snippets as HTML. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => safeChar(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeChar(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeChar(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

/** "Maya Chen <maya@…>, Alex <alex@…>" → "Maya Chen, Alex". */
export function recipientNames(raw: string | undefined): string | null {
  if (!raw) return null;
  const names = raw
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((part) => {
      const parsed = parseFromHeader(part);
      return parsed.name ?? (parsed.address || part.trim());
    })
    .filter(Boolean);
  return names.length ? names.join(", ") : null;
}

export function toMessageDto(
  meta: MessageMetadata,
  options: {
    /** User label id → name. System labels are left out of the row. */
    labels: Map<string, string>;
    accountEmail: string;
    provider: string;
    /** True when the search itself required attachments. */
    attachmentsKnown: boolean;
  },
): ClearOutMessageDto {
  const from = parseFromHeader(meta.headers.from);
  const subject = meta.headers.subject ? decodeMimeWords(meta.headers.subject).trim() : "";

  return {
    id: meta.id,
    threadId: meta.threadId,
    fromName: from.name,
    fromAddress: from.address,
    to: recipientNames(meta.headers.to),
    sentByMe: meta.labelIds.includes("SENT") || from.address === options.accountEmail.toLowerCase(),
    subject: subject || null,
    snippet: decodeEntities(meta.snippet).trim(),
    receivedAt: meta.date?.toISOString() ?? null,
    unread: meta.labelIds.includes("UNREAD"),
    inInbox: meta.labelIds.includes("INBOX"),
    hasAttachment:
      options.attachmentsKnown || /multipart\/mixed/i.test(meta.headers["content-type"] ?? ""),
    sizeBytes: meta.sizeEstimate,
    labels: meta.labelIds
      .filter((id) => options.labels.has(id))
      .map((id) => ({ id, name: options.labels.get(id)! })),
    gmailUrl: gmailMessageUrl(options.provider, options.accountEmail, meta.id),
  };
}

export function toPreviewDto(
  meta: MessageMetadata,
  options: Parameters<typeof toMessageDto>[1],
): ClearOutPreviewDto {
  return { ...toMessageDto(meta, options), cc: recipientNames(meta.headers.cc) };
}
