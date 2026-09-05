/**
 * Email header parsing.
 *
 * This is the heart of finding subscriptions. Everything here is pure — no
 * network, no database — so it is easy to reason about and easy to test.
 */

export type ParsedAddress = {
  /** Lowercased address, e.g. "news@figma.com". Empty if unparseable. */
  address: string;
  /** Display name, decoded, e.g. "Figma". Null if the header had none. */
  name: string | null;
};

export type UnsubscribeTargets = {
  /** First https URL found in List-Unsubscribe. */
  http: string | null;
  /** First mailto address found in List-Unsubscribe. */
  mailto: string | null;
  /** Mailto subject, if the header specified one. */
  mailtoSubject: string | null;
  /** True when RFC 8058 one-click is advertised AND an https URL exists. */
  oneClick: boolean;
};

/**
 * Decodes RFC 2047 encoded words, e.g.
 *   =?UTF-8?B?RmlnbWEgTmV3cw==?=   ->  "Figma News"
 *   =?ISO-8859-1?Q?caf=E9?=        ->  "café"
 *
 * Newsletter senders use these constantly for non-ASCII names. Without this
 * the UI is full of mojibake.
 */
export function decodeMimeWords(input: string): string {
  if (!input.includes("=?")) return input;

  return input.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (match, charsetRaw: string, encodingRaw: string, text: string) => {
      try {
        const charset = charsetRaw.split("*")[0].toLowerCase();
        const encoding = encodingRaw.toUpperCase();

        let bytes: Buffer;
        if (encoding === "B") {
          bytes = Buffer.from(text, "base64");
        } else {
          // Quoted-printable: "_" means space, "=XX" is a hex byte.
          const normalised = text.replace(/_/g, " ");
          const out: number[] = [];
          for (let i = 0; i < normalised.length; i++) {
            if (normalised[i] === "=" && i + 2 < normalised.length) {
              const hex = normalised.slice(i + 1, i + 3);
              if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                out.push(parseInt(hex, 16));
                i += 2;
                continue;
              }
            }
            out.push(normalised.charCodeAt(i));
          }
          bytes = Buffer.from(out);
        }

        // Node knows utf-8 and latin1 natively; TextDecoder covers the rest.
        if (charset === "utf-8" || charset === "utf8") return bytes.toString("utf8");
        if (charset === "iso-8859-1" || charset === "latin1") {
          return bytes.toString("latin1");
        }
        try {
          return new TextDecoder(charset).decode(bytes);
        } catch {
          return bytes.toString("utf8");
        }
      } catch {
        return match;
      }
    },
  );
}

/**
 * Parses a From header into a name and an address.
 *
 * Handles the shapes that actually turn up in real mail:
 *   Figma <news@figma.com>
 *   "Figma, Inc." <news@figma.com>
 *   =?UTF-8?B?RmlnbWE=?= <news@figma.com>
 *   news@figma.com
 */
export function parseFromHeader(raw: string | undefined | null): ParsedAddress {
  if (!raw) return { address: "", name: null };

  const value = raw.trim();
  const angle = value.match(/<([^>]+)>/);

  if (angle) {
    const address = angle[1].trim().toLowerCase();
    let name = value.slice(0, angle.index).trim();
    // Strip surrounding quotes.
    name = name.replace(/^"(.*)"$/s, "$1").trim();
    name = decodeMimeWords(name).trim();
    return { address, name: name.length > 0 ? name : null };
  }

  // No angle brackets — the whole value should be a bare address.
  const bare = value.replace(/^"(.*)"$/s, "$1").trim().toLowerCase();
  return { address: isEmailAddress(bare) ? bare : "", name: null };
}

export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

/**
 * Parses List-Unsubscribe (RFC 2369) and List-Unsubscribe-Post (RFC 8058).
 *
 * A typical header looks like:
 *   List-Unsubscribe: <https://x.com/u?id=9>, <mailto:un@x.com?subject=stop>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *
 * One-click is the good case: a single POST unsubscribes with no user
 * interaction and no confirmation page. It is only valid over https, so we
 * never set the flag for a mailto-only sender.
 */
export function parseUnsubscribeHeaders(
  listUnsubscribe: string | undefined | null,
  listUnsubscribePost: string | undefined | null,
): UnsubscribeTargets {
  const result: UnsubscribeTargets = {
    http: null,
    mailto: null,
    mailtoSubject: null,
    oneClick: false,
  };

  if (!listUnsubscribe) return result;

  // Pull out every <...> entry. Some senders omit the brackets, so fall back
  // to splitting on commas.
  let entries = [...listUnsubscribe.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  if (entries.length === 0) {
    entries = listUnsubscribe.split(",").map((s) => s.trim()).filter(Boolean);
  }

  for (const entry of entries) {
    const lower = entry.toLowerCase();

    if (lower.startsWith("mailto:") && !result.mailto) {
      const withoutScheme = entry.slice("mailto:".length);
      const [addr, query] = withoutScheme.split("?");
      const address = addr.trim().toLowerCase();
      if (isEmailAddress(address)) {
        result.mailto = address;
        if (query) {
          const params = new URLSearchParams(query);
          const subject = params.get("subject");
          if (subject) result.mailtoSubject = subject;
        }
      }
      continue;
    }

    if ((lower.startsWith("https://") || lower.startsWith("http://")) && !result.http) {
      try {
        const url = new URL(entry);
        result.http = url.toString();
      } catch {
        // Malformed URL — ignore this entry rather than failing the whole header.
      }
    }
  }

  const post = (listUnsubscribePost ?? "").toLowerCase();
  // RFC 8058 requires https for one-click.
  result.oneClick =
    post.includes("one-click") &&
    result.http !== null &&
    result.http.startsWith("https://");

  return result;
}

/**
 * Last-resort fallback: find an unsubscribe link inside the message body.
 *
 * Used only when a sender publishes no List-Unsubscribe header. We score
 * candidate links and take the best one, because a marketing email contains
 * dozens of links and only one of them ends the relationship.
 */
export function findUnsubscribeLinkInBody(html: string): string | null {
  if (!html) return null;

  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  let best: { url: string; score: number } | null = null;

  for (const [, hrefRaw, innerRaw] of anchors) {
    const href = decodeHtmlEntities(hrefRaw.trim());
    if (!/^https?:\/\//i.test(href)) continue;

    const text = decodeHtmlEntities(innerRaw.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    let score = 0;
    if (/\bunsubscribe\b/.test(text)) score += 10;
    if (/\bopt[- ]?out\b/.test(text)) score += 8;
    if (/\bmanage (your )?(email )?preferences\b/.test(text)) score += 5;
    if (/\bstop (receiving|these)\b/.test(text)) score += 5;

    const hrefLower = href.toLowerCase();
    if (/unsubscribe/.test(hrefLower)) score += 6;
    if (/optout|opt-out|opt_out/.test(hrefLower)) score += 5;
    if (/\/unsub\b|[?&]unsub=/.test(hrefLower)) score += 4;
    if (/preferences|email-settings|manage-subscription/.test(hrefLower)) score += 2;

    if (score === 0) continue;
    if (!best || score > best.score) best = { url: href, score };
  }

  return best?.url ?? null;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&nbsp;/g, " ");
}
