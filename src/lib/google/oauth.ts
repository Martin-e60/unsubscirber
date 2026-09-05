import "server-only";
import { env } from "@/lib/env";
import { GOOGLE_SCOPES } from "@/lib/constants";

/**
 * Google OAuth 2.0, done by hand with fetch.
 *
 * There is no OAuth library here on purpose: the whole dance is four HTTP
 * calls, and having them visible means you can read exactly what is sent to
 * Google and what comes back.
 *
 * The flow:
 *   1. Send the user to Google with `getAuthorizationUrl()`
 *   2. Google redirects back to /api/auth/google/callback with a `code`
 *   3. `exchangeCodeForTokens()` swaps that code for an access + refresh token
 *   4. `refreshAccessToken()` keeps it alive afterwards
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export type GoogleTokens = {
  accessToken: string;
  /** Only present on the very first authorisation, or with prompt=consent. */
  refreshToken: string | null;
  /** Epoch milliseconds. */
  expiresAt: number;
  scope: string;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    state,
    // `offline` is what makes Google issue a refresh token at all.
    access_type: "offline",
    // Forces the consent screen so we reliably receive a refresh token, even
    // for a user who has authorised this app before.
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      `Google rejected the authorisation code: ${data.error ?? response.status} ` +
        `${data.error_description ?? ""}`.trim(),
    );
  }

  return {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : null,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    scope: String(data.scope ?? ""),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    // invalid_grant means the user revoked access or the token expired after
    // long disuse. The caller should ask them to reconnect.
    throw new TokenRefreshError(
      `Could not refresh Google access token: ${data.error ?? response.status}`,
      String(data.error ?? "unknown"),
    );
  }

  return {
    accessToken: String(data.access_token),
    // A refresh response does not return a new refresh token — keep the old one.
    refreshToken: null,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    scope: String(data.scope ?? ""),
  };
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Could not read Google profile: HTTP ${response.status}`);
  }
  return (await response.json()) as GoogleUserInfo;
}

/** Best-effort revoke, used when disconnecting an account. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Revoking is a courtesy; failing to revoke must not block disconnecting.
  }
}

export class TokenRefreshError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = "TokenRefreshError";
  }
}
