"use client";
import { useState } from "react";
import styles from "./AuthPage.module.css";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <div className={styles.switch}>
    <button className={styles.textButton} disabled={pending} onClick={async () => {
      setPending(true); setError(false);
      try {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (!response.ok) throw new Error();
        window.location.assign("/login");
      } catch { setError(true); setPending(false); }
    }}>{pending ? "Signing out…" : "Sign out"}</button>
    {error && <p role="alert">Could not sign out. Please try again.</p>}
  </div>;
}
