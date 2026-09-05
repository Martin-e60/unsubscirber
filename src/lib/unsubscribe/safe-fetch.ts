import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { isPrivateAddress } from "./ip";

/**
 * Guarded outbound fetch.
 *
 * The unsubscribe engine follows URLs that arrive in email headers, which is
 * to say URLs chosen by strangers. Without a guard that is a server-side
 * request forgery hole: a sender could point us at http://169.254.169.254/ and
 * read cloud metadata, or at a service on the private network.
 *
 * So: only http/https, every hop resolved and checked against private IP
 * ranges, redirects followed manually, a hard timeout, and a capped body read.
 */

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 256 * 1024;

export type SafeFetchResult = {
  status: number;
  finalUrl: string;
  /** First 256KB of the body, decoded as UTF-8. */
  body: string;
};

export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
): Promise<SafeFetchResult> {
  let url = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);

    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Some senders serve a different page to obvious bots.
        "User-Agent":
          "Mozilla/5.0 (compatible; UnsubscriberBot/1.0; +https://example.com/bot)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        ...(init.headers ?? {}),
      },
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("location");

    if (isRedirect && location && hop < MAX_REDIRECTS) {
      url = new URL(location, url).toString();
      // A redirected POST becomes a GET, matching normal browser behaviour.
      init = { ...init, method: "GET", body: undefined };
      continue;
    }

    return {
      status: response.status,
      finalUrl: url,
      body: await readCapped(response),
    };
  }

  throw new Error("Too many redirects");
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});

  return Buffer.concat(chunks).toString("utf8").slice(0, MAX_BODY_BYTES);
}

/** Throws unless the URL is http(s) and resolves to a public IP address. */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Not a valid URL: ${rawUrl.slice(0, 120)}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Refusing to open a ${url.protocol} URL`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Refusing to open an internal hostname");
  }

  const addresses = net.isIP(hostname)
    ? [hostname]
    : (await dns.lookup(hostname, { all: true })).map((a) => a.address);

  if (addresses.length === 0) throw new Error("Hostname did not resolve");

  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error("Refusing to open a private network address");
    }
  }
}
