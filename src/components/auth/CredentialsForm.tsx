"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import type { AuthMode } from "@/lib/auth-flow";
import styles from "./AuthPage.module.css";

export function CredentialsForm({ mode }: { mode: AuthMode }) {
  const register = mode === "register";
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"),
          ...(register ? { name: form.get("name") } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Please try again.");
      // Destinations are fixed locally; never trust an arbitrary redirect URL.
      window.location.assign(result.redirectTo === "/dashboard" ? "/dashboard" : "/connect");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect. Please try again.");
      setPending(false);
    }
  }

  return <form onSubmit={submit} className={styles.form} aria-label={register ? "Create an account with email" : "Log in with email"}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <fieldset disabled={pending}>
      {register && <label htmlFor="auth-name">Your name<input id="auth-name" name="name" autoComplete="name" placeholder="Alex Morgan" required maxLength={100} /></label>}
      <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>
      <label htmlFor="auth-password">Password</label>
      <div className={styles.password}>
        <input id="auth-password" name="password" type={visible ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"}
          placeholder={register ? "Create a strong password" : "Enter your password"} required minLength={register ? 12 : 1} maxLength={128} aria-describedby={register ? "password-hint" : undefined} />
        <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
      {register && <p id="password-hint" className={styles.passwordHint}>Use at least 12 characters. A few memorable words work well.</p>}
      <button type="submit" className={styles.submit} aria-busy={pending}>
        {pending ? "Please wait…" : register ? "Create account" : "Log in"}
        {pending ? <LoaderCircle size={18} className={styles.spinner} aria-hidden /> : <ArrowRight size={18} aria-hidden />}
      </button>
    </fieldset>
  </form>;
}
