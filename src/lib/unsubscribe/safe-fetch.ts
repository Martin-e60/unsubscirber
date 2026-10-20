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
  // One deadline for the entire redirect chain, including response bodies.
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    signal.throwIfAborted();
    await assertPublicUrl(url, signal);

    const headers = new Headers(init.headers);
    if (!headers.has("User-Agent")) headers.set("User-Agent", "Mozilla/5.0 (compatible; Tidely/1.0)");
    if (!headers.has("Accept")) headers.set("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");

    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal,
      headers,
    });

    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    const location = response.headers.get("location");

    if (isRedirect && location && init.redirect !== "manual") {
      // Release each response before following it, including rejected hops.
      await response.body?.cancel();
      if (init.redirect === "error") throw new Error("Redirects are not allowed");
      if (hop === MAX_REDIRECTS) throw new Error("Too many redirects");

      const next = new URL(location, url);
      if (next.origin !== new URL(url).origin) {
        headers.delete("Authorization");
        headers.delete("Cookie");
      }
      const method = (init.method ?? "GET").toUpperCase();
      const switchToGet =
        ((response.status === 301 || response.status === 302) && method === "POST") ||
        (response.status === 303 && method !== "GET" && method !== "HEAD");
      if (switchToGet) {
        headers.delete("Content-Type");
        headers.delete("Content-Length");
      }
      init = { ...init, headers, ...(switchToGet ? { method: "GET", body: undefined } : {}) };
      url = next.toString();
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

  try {
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, MAX_BODY_BYTES - total);
      chunks.push(chunk);
      total += chunk.byteLength;
    }
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Throws unless the URL is http(s) and resolves to a public IP address. */
export async function assertPublicUrl(rawUrl: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Not a valid URL: ${rawUrl.slice(0, 120)}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Refusing to open a ${url.protocol} URL`);
  }
  if (url.username || url.password) throw new Error("Refusing to open a URL with credentials");

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
    : (await lookup(hostname, signal)).map((a) => a.address);

  if (addresses.length === 0) throw new Error("Hostname did not resolve");

  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error("Refusing to open a private network address");
    }
  }
}

/** Stop waiting for DNS too when the request's shared deadline is reached. */
async function lookup(hostname: string, signal?: AbortSignal) {
  if (!signal) return dns.lookup(hostname, { all: true });
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      dns.lookup(hostname, { all: true }),
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
