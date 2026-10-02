import type { Metadata } from "next";
import Link from "next/link";
import { passwordRecoveryAvailable } from "@/lib/mail/system";
import { AuthShell } from "@/components/auth/login/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/login/RecoveryForms";
import styles from "@/components/auth/login/Login.module.css";

export const metadata: Metadata = { title: "Reset your password — Tidely" };
export const dynamic = "force-dynamic";

/**
 * Asking for a reset link. Offered only where a link can actually be
 * delivered; elsewhere the page says so plainly instead of pretending.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      {passwordRecoveryAvailable() ? (
        <ForgotPasswordForm />
      ) : (
        <>
          <h1 className={styles.title}>Password reset isn’t available.</h1>
          <p className={styles.subtitle}>
            This copy of Tidely can’t send email yet, so it can’t send a reset link. If you signed up with Google,
            use Continue with Google instead.
          </p>
          <Link href="/login" className={styles.primary}>
            Back to sign in
          </Link>
        </>
      )}
    </AuthShell>
  );
}
