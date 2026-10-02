"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, LoaderCircle, MailCheck } from "lucide-react";
import { PasswordField } from "./fields";
import styles from "./Login.module.css";

/**
 * Password recovery: asking for a link, then choosing a new password with
 * it. Both talk to the real endpoints, and neither reveals whether an
 * address has an account.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function BackToSignIn() {
  return (
    <p className={styles.switch}>
      <Link href="/login" className={styles.backLink}>
        <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        Back to sign in
      </Link>
    </p>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const busy = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sentTo) doneRef.current?.focus();
  }, [sentTo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const trimmed = email.trim();
    if (!EMAIL.test(trimmed)) {
      setFieldError(trimmed ? "Enter an email address like you@example.com." : "Enter your email address.");
      emailRef.current?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    setFieldError(null);
    setError(null);
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Too many requests. Please wait 15 minutes and try again."
            : response.status === 400
              ? "Enter a valid email address."
              : "We couldn’t send a reset link just now. Please try again.",
        );
        return;
      }
      setSentTo(trimmed);
    } catch {
      setError("We couldn’t reach Tidely. Check your connection and try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <>
        <div className={styles.doneIcon} aria-hidden="true">
          <MailCheck size={26} strokeWidth={1.8} />
        </div>
        <h1 className={styles.title}>Check your email.</h1>
        <div className={styles.subtitle} tabIndex={-1} ref={doneRef} role="status">
          <p>
            If an account uses <strong className={styles.address}>{sentTo}</strong>, a link to reset its
            password is on its way. It works once and expires in 30 minutes.
          </p>
          <p className={styles.small}>Nothing arrived? Check your spam folder, or ask again in a few minutes.</p>
        </div>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            setSentTo(null);
            window.setTimeout(() => emailRef.current?.focus(), 0);
          }}
        >
          Use a different email
        </button>
        <BackToSignIn />
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>Forgot your password?</h1>
      <p className={styles.subtitle}>Enter your email and we’ll send you a link to choose a new one.</p>

      {error ? (
        <div className={styles.alert} role="alert">
          <CircleAlert size={18} strokeWidth={2} aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={submit} noValidate aria-label="Ask for a password reset link">
        <fieldset disabled={pending} className={styles.fieldset}>
          <div className={styles.field}>
            <label htmlFor="forgot-email" className={styles.label}>
              Email
            </label>
            <input
              ref={emailRef}
              id="forgot-email"
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
                if (fieldError) setFieldError(null);
              }}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "forgot-email-error" : undefined}
            />
            {fieldError ? (
              <p id="forgot-email-error" className={styles.fieldError}>
                {fieldError}
              </p>
            ) : null}
          </div>

          <button type="submit" className={styles.primary} aria-busy={pending || undefined}>
            {pending ? (
              <>
                <LoaderCircle size={20} className={styles.spinner} aria-hidden />
                Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </fieldset>
      </form>

      <p className={styles.small}>
        Signed up with Google? You don’t have a Tidely password — use Continue with Google on the sign-in page.
      </p>
      <BackToSignIn />
    </>
  );
}

export function ResetPasswordForm() {
  // The token travels after "#" so it never reaches a server log; read it
  // once, then take it out of the address bar and history.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Read exactly once: the address is cleaned straight after, so a second
  // run of this effect (React does that in development) must not re-read it.
  const fromLink = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (fromLink.current === undefined) {
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
      fromLink.current = value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    }
    setToken(fromLink.current);
  }, []);

  useEffect(() => {
    if (done) window.setTimeout(() => window.location.assign("/login?reset=done"), 1200);
  }, [done]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !token) return;
    const next: typeof errors = {};
    if (password.length < 12) next.password = "Use at least 12 characters. A few memorable words work well.";
    else if (password.length > 128) next.password = "Use no more than 128 characters.";
    if (!next.password && confirm !== password) next.confirm = "The two passwords don’t match.";
    setErrors(next);
    if (next.password || next.confirm) {
      (next.password ? passwordRef : confirmRef).current?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
        // Only the two answers this endpoint gives on purpose are shown.
        const known =
          typeof data?.error === "string" &&
          (data.error.startsWith("This reset link") || data.error.startsWith("Use a password"))
            ? data.error
            : null;
        setError(
          known ??
            (response.status === 403
              ? "This page has been open for a while. Refresh it and try again."
              : "We couldn’t update your password just now. Please try again."),
        );
        if (known?.startsWith("This reset link")) setToken(null);
        return;
      }
      setDone(true);
    } catch {
      setError("We couldn’t reach Tidely. Check your connection and try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (token === undefined) {
    return <p className={styles.subtitle}>Checking your link…</p>;
  }

  if (done) {
    return (
      <>
        <div className={styles.doneIcon} aria-hidden="true">
          <MailCheck size={26} strokeWidth={1.8} />
        </div>
        <h1 className={styles.title}>Password updated.</h1>
        <p className={styles.subtitle} role="status">
          You’ve been signed out everywhere else. Taking you to sign in…
        </p>
        <Link href="/login?reset=done" className={styles.primary}>
          Sign in
        </Link>
      </>
    );
  }

  if (token === null) {
    return (
      <>
        <h1 className={styles.title}>This link can’t be used.</h1>
        {error ? (
          <div className={styles.alert} role="alert">
            <CircleAlert size={18} strokeWidth={2} aria-hidden />
            <p>{error}</p>
          </div>
        ) : (
          <p className={styles.subtitle}>
            Reset links work once and expire after 30 minutes. Ask for a new one and use the newest email.
          </p>
        )}
        <Link href="/forgot-password" className={styles.primary}>
          Ask for a new link
        </Link>
        <BackToSignIn />
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>Choose a new password.</h1>
      <p className={styles.subtitle}>Use at least 12 characters. A few memorable words work well.</p>

      {error ? (
        <div className={styles.alert} role="alert">
          <CircleAlert size={18} strokeWidth={2} aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={submit} noValidate aria-label="Choose a new password">
        {/* For password managers: which account this password belongs to. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <fieldset disabled={pending} className={styles.fieldset}>
          <div className={styles.field}>
            <label htmlFor="reset-password" className={styles.label}>
              New password
            </label>
            <PasswordField
              ref={passwordRef}
              id="reset-password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
              }}
              invalid={Boolean(errors.password)}
              describedBy={errors.password ? "reset-password-error" : undefined}
            />
            {errors.password ? (
              <p id="reset-password-error" className={styles.fieldError}>
                {errors.password}
              </p>
            ) : null}
          </div>

          <div className={styles.field}>
            <label htmlFor="reset-confirm" className={styles.label}>
              Confirm new password
            </label>
            <PasswordField
              ref={confirmRef}
              id="reset-confirm"
              name="confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(value) => {
                setConfirm(value);
                if (errors.confirm) setErrors((current) => ({ ...current, confirm: undefined }));
              }}
              invalid={Boolean(errors.confirm)}
              describedBy={errors.confirm ? "reset-confirm-error" : undefined}
            />
            {errors.confirm ? (
              <p id="reset-confirm-error" className={styles.fieldError}>
                {errors.confirm}
              </p>
            ) : null}
          </div>

          <button type="submit" className={styles.primary} aria-busy={pending || undefined}>
            {pending ? (
              <>
                <LoaderCircle size={20} className={styles.spinner} aria-hidden />
                Saving…
              </>
            ) : (
              "Save new password"
            )}
          </button>
        </fieldset>
      </form>
      <BackToSignIn />
    </>
  );
}
