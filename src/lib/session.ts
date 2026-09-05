import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./constants";

/**
 * Login sessions.
 *
 * The session is a signed JWT in an httpOnly cookie. It carries only the user
 * id — never tokens, never the email — so the cookie is useless on its own and
 * every request re-reads the user from the database.
 */

export type SessionPayload = {
  userId: string;
};

export async function createSession(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(env.sessionSecret);
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, env.sessionSecret);
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    // Expired or tampered with. Treat exactly like "not logged in".
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
