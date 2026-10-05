import "server-only";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import type { AuthError } from "@/lib/auth-flow";

/** Back to the sign-in or sign-up page with a safe, fixed error code. */
export function authFailure(mode: "login" | "register", error: AuthError) {
  const target = new URL(`/${mode}`, env.appUrl);
  target.searchParams.set("error", error);
  const response = NextResponse.redirect(target);
  response.cookies.delete("oauth_state");
  return response;
}

/**
 * The end of adding or reconnecting a mailbox: back into the app, with the
 * outcome in fixed query parameters the page reads once and removes.
 * `path` has already been through safeNextPath (or is a constant).
 */
export function mailboxReturn(path: string, params: Record<string, string>) {
  const target = new URL(path, env.appUrl);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  const response = NextResponse.redirect(target);
  response.cookies.delete("oauth_state");
  return response;
}
