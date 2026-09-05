export type AuthMode = "login" | "register";

export function authMode(value: unknown): AuthMode {
  return value === "register" ? "register" : "login";
}

const AUTH_ERRORS = {
  cancelled: "Google sign-in was cancelled. You can try again whenever you're ready.",
  incomplete: "Google couldn't complete sign-in. Please try again.",
  expired: "Your sign-in session expired. Please try again.",
  unavailable: "Google sign-in is temporarily unavailable. Please try again later.",
  failed: "We couldn't sign you in. Please try again.",
  account_exists: "This email already has an account. Log in with your password, then connect Google in your account.",
  account_linked: "This Google account is already connected to another Tidely account.",
} as const;

export type AuthError = keyof typeof AUTH_ERRORS;

export function authErrorMessage(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return Object.hasOwn(AUTH_ERRORS, value)
    ? AUTH_ERRORS[value as AuthError]
    : AUTH_ERRORS.failed;
}
