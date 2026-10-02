import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";

export type OAuthMode = "login" | "register" | "connect";
/** "organise": a reconnect that adds Clear out's modify permission. */
export type OAuthAccess = "organise" | null;
export async function createOAuthState(state: string, mode: OAuthMode, userId: string | null, access: OAuthAccess = null) {
  return new SignJWT({ state, mode, userId, access }).setProtectedHeader({ alg: "HS256" })
    .setAudience("tidely-oauth").setIssuedAt().setExpirationTime("10m").sign(env.sessionSecret);
}

export async function readOAuthState(cookie: string | undefined, state: string | null) {
  if (!cookie || !state) return null;
  try {
    const { payload } = await jwtVerify(cookie, env.sessionSecret, { algorithms: ["HS256"], audience: "tidely-oauth" });
    if (typeof payload.state !== "string" || !safeEqual(payload.state, state)) return null;
    if (payload.mode !== "login" && payload.mode !== "register" && payload.mode !== "connect") return null;
    if (payload.mode === "connect" && typeof payload.userId !== "string") return null;
    const access: OAuthAccess = payload.access === "organise" && payload.mode === "connect" ? "organise" : null;
    return { mode: payload.mode as OAuthMode, userId: typeof payload.userId === "string" ? payload.userId : null, access };
  } catch { return null; }
}
