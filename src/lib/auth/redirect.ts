import "server-only";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import type { AuthError } from "@/lib/auth-flow";
import type { OAuthMode } from "./oauth-state";

export function authFailure(mode: OAuthMode, error: AuthError) {
  const target = new URL(`/${mode}`, env.appUrl);
  target.searchParams.set("error", error);
  const response = NextResponse.redirect(target);
  response.cookies.delete("oauth_state");
  return response;
}
