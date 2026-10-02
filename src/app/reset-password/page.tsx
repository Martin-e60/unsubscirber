import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/login/AuthShell";
import { ResetPasswordForm } from "@/components/auth/login/RecoveryForms";

export const metadata: Metadata = {
  title: "Choose a new password — Tidely",
  // Belt and braces: the token is in the fragment, which is never sent, but
  // no link on this page should carry a referrer either.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  );
}
