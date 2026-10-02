"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { safeNextPath } from "@/lib/auth/next";
import { GoogleMark, PasswordField } from "./fields";
import styles from "./Login.module.css";

/**
 * Signing in: Google, or email and password.
 *
 * Both use the existing flows — /api/auth/google/start, and POST
 * /api/auth/login, which sets the session cookie. Nothing here decides that
 * someone is signed in; the browser only moves on once the server says so,
 * and only to a destination that passes the same safe-path check the server
 * applies.
 */

type FieldErrors = { email?: string; password?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Server answers, by status, in words that never echo what came back. */
function failureMessage(status: number): string {
  if (status === 401) return "Email or password is incorrect.";
  if (status === 429) return "Too many attempts. Please wait 15 minutes and try again.";
  if (status === 403) return "This page has been open for a while. Refresh it and try again.";
  if (status === 400) return "Check your email address and password, then try again.";
  return "We couldn’t sign you in just now. Please try again.";
}

export function LoginForm({
  next,
  urlError,
  notice,
  recoveryAvailable,
  devSignIn,
}: {
  next: string | null;
  /** A Google sign-in problem, already turned into plain words. */
  urlError: string | null;
  notice: string | null;
  recoveryAvailable: boolean;
  devSignIn: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(urlError);
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const busy = useRef(false);
  // Where focus goes once a failed attempt has re-enabled the form.
  const [focusAfter, setFocusAfter] = useState<"password" | "alert" | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Coming back with the browser's Back button after leaving for Google
  // restores this page as it was; it must not stay "Connecting…".
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      busy.current = false;
      setPending(null);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  useEffect(() => {
    if (pending || !focusAfter) return;
    (focusAfter === "password" ? passwordRef : errorRef).current?.focus();
    setFocusAfter(null);
  }, [pending, focusAfter]);

  const googleHref = `/api/auth/google/start?mode=login${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;

    const trimmed = email.trim();
    const errors: FieldErrors = {};
    if (!trimmed) errors.email = "Enter your email address.";
    else if (!EMAIL.test(trimmed)) errors.email = "Enter an email address like you@example.com.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      setError(null);
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    busy.current = true;
    setPending("email");
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, password, next }),
      });
      const result = (await response.json().catch(() => null)) as { redirectTo?: unknown } | null;
      if (!response.ok) {
        setError(failureMessage(response.status));
        if (response.status === 401) setPassword("");
        busy.current = false;
        setPending(null);
        setFocusAfter(response.status === 401 ? "password" : "alert");
        return;
      }
      // Only the destinations the server may choose, checked again here.
      const destination = result?.redirectTo === "/connect" ? "/connect" : (safeNextPath(result?.redirectTo) ?? "/dashboard");
      window.location.assign(destination);
    } catch {
      setError("We couldn’t reach Tidely. Check your connection and try again.");
      busy.current = false;
      setPending(null);
      setFocusAfter("alert");
    }
  }

  return (
    <>
      <h1 className={styles.title}>Welcome back.</h1>
      <p className={styles.subtitle}>Sign in to your Tidely account.</p>

      {notice && !error ? (
        <div className={styles.notice} role="status">
          <CircleCheck size={18} strokeWidth={2} aria-hidden />
          <p>{notice}</p>
        </div>
      ) : null}

      {error ? (
        <div className={styles.alert} role="alert" tabIndex={-1} ref={errorRef}>
          <CircleAlert size={18} strokeWidth={2} aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <a
        className={styles.google}
        href={googleHref}
        aria-disabled={pending !== null || undefined}
        aria-busy={pending === "google" || undefined}
        onClick={(event) => {
          if (busy.current) {
            event.preventDefault();
            return;
          }
          busy.current = true;
          setPending("google");
          setError(null);
        }}
      >
        {pending === "google" ? (
          <LoaderCircle size={22} className={styles.spinner} aria-hidden />
        ) : (
          <GoogleMark />
        )}
        {pending === "google" ? "Connecting to Google…" : "Continue with Google"}
      </a>

      <div className={styles.divider}>
        <span>or sign in with email</span>
      </div>

      <form className={styles.form} onSubmit={submit} noValidate aria-label="Sign in with email">
        <fieldset disabled={pending !== null} className={styles.fieldset}>
          <div className={styles.field}>
            <label htmlFor="login-email" className={styles.label}>
              Email
            </label>
            <input
              ref={emailRef}
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              maxLength={254}
              className={styles.input}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            />
            {fieldErrors.email ? (
              <p id="login-email-error" className={styles.fieldError}>
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className={styles.field}>
            <label htmlFor="login-password" className={styles.label}>
              Password
            </label>
            <PasswordField
              ref={passwordRef}
              id="login-password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
              invalid={Boolean(fieldErrors.password)}
              describedBy={fieldErrors.password ? "login-password-error" : undefined}
            />
            {fieldErrors.password ? (
              <p id="login-password-error" className={styles.fieldError}>
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          {recoveryAvailable ? (
            <p className={styles.forgot}>
              <Link href="/forgot-password">Forgot password?</Link>
            </p>
          ) : null}

          <button type="submit" className={styles.primary} aria-busy={pending === "email" || undefined}>
            {pending === "email" ? (
              <>
                <LoaderCircle size={20} className={styles.spinner} aria-hidden />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </fieldset>
      </form>

      <p className={styles.switch}>
        New to Tidely? <Link href="/register">Create an account</Link>
      </p>

      {devSignIn ? (
        <p className={styles.dev}>
          <a href="/api/auth/dev">Local development sign-in</a> · never available in production
        </p>
      ) : null}
    </>
  );
}
