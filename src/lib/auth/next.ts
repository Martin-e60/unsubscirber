/**
 * Where to go after signing in.
 *
 * A sign-in link may carry `?next=/clear-out` so people land back where they
 * were asked to sign in. Anything that arrives in a URL is untrusted, so only
 * a same-site path into the signed-in app is accepted: no other origin, no
 * protocol-relative "//", no backslashes, no auth or API routes. Anything
 * else is dropped and the usual destination is used instead.
 *
 * Pure and shared, so the server and the browser apply the same rule.
 */

const ALLOWED_PREFIXES = [
  "/dashboard",
  "/cleanup",
  "/clear-out",
  "/unsubscribed",
  "/settings",
  "/history",
  "/connect",
  "/rollups",
  "/senders",
];

const PLACEHOLDER_ORIGIN = "https://tidely.invalid";

export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  // One leading slash, then not another one or a backslash; no control
  // characters or whitespace anywhere.
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;

  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
  if (!allowed) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** The sign-in page, remembering where to come back to. */
export function loginHref(next?: string | null): string {
  const safe = safeNextPath(next);
  return safe && safe !== "/dashboard" ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
