import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/api/auth";
import { authErrorMessage } from "@/lib/auth-flow";
import { safeNextPath } from "@/lib/auth/next";
import { passwordRecoveryAvailable } from "@/lib/mail/system";
import { AuthShell } from "@/components/auth/login/AuthShell";
import { LoginForm } from "@/components/auth/login/LoginForm";

export const metadata: Metadata = { title: "Sign in — Tidely" };
export const dynamic = "force-dynamic";

/**
 * Sign in. Someone already signed in goes straight on — to the page that
 * sent them here if it is a safe internal one, otherwise Home.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; next?: string | string[]; reset?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  if (await getCurrentUser()) redirect(next ?? "/dashboard");

  return (
    <AuthShell>
      <LoginForm
        next={next}
        urlError={authErrorMessage(Array.isArray(params.error) ? params.error[0] : params.error)}
        notice={params.reset === "done" ? "Your password has been changed. Sign in with your new one." : null}
        recoveryAvailable={passwordRecoveryAvailable()}
        devSignIn={process.env.NODE_ENV !== "production"}
      />
    </AuthShell>
  );
}
