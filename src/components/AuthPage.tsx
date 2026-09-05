import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Inbox, Mail, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { authErrorMessage, type AuthMode } from "@/lib/auth-flow";
import styles from "./AuthPage.module.css";
import { CredentialsForm } from "./CredentialsForm";

export function AuthPage({ mode, error }: { mode: AuthMode; error?: string | string[] }) {
  const register = mode === "register";
  const message = authErrorMessage(error);

  return (
    <div className={styles.page}>
      <section className={styles.main}>
        <header className={styles.header}>
          <Link href="/" aria-label="Tidely home" className={styles.logo}><Logo /></Link>
          <Link href="/" className={styles.back}><ArrowLeft size={15} aria-hidden /> Back to home</Link>
        </header>

        <main className={styles.content}>
          <nav className={styles.tabs} aria-label="Account access">
            <Link href="/login" aria-current={!register ? "page" : undefined}>Log in</Link>
            <Link href="/register" aria-current={register ? "page" : undefined}>Create account</Link>
          </nav>

          <p className={styles.eyebrow}>{register ? "A little less inbox. A little more life." : "Your quieter inbox awaits"}</p>
          <h1>{register ? "Make room for\nwhat matters." : "Welcome back."}</h1>
          <p className={styles.description}>
            {register
              ? "Create your account and take the first step toward a calmer inbox."
              : "Log in to Tidely to pick up where you left off and keep your inbox feeling lighter."}
          </p>

          {message && <div className={styles.error} role="alert">{message}</div>}

          <a className={styles.google} href={`/api/auth/google/start?mode=${mode}`}>
            <GoogleMark />
            {register ? "Sign up with Google" : "Continue with Google"}
            <ArrowRight size={18} aria-hidden />
          </a>
          <div className={styles.divider}><span>or continue with email</span></div>
          <CredentialsForm mode={mode} />

          <p className={styles.hint}><ShieldCheck size={14} aria-hidden /> Your inbox stays yours. Connect Gmail with your permission.</p>

          <p className={styles.switch}>
            {register ? "Already have an account? " : "New to Tidely? "}
            <Link href={register ? "/login" : "/register"}>{register ? "Log in" : "Create an account"}</Link>
          </p>

          {process.env.NODE_ENV !== "production" && (
            <p className={styles.demo}><a href="/api/auth/dev">Explore the demo <ArrowRight size={14} aria-hidden /></a><span>Development preview</span></p>
          )}
        </main>
        <footer className={styles.footer}>A tidier inbox, effortlessly.</footer>
      </section>

      <aside className={styles.aside} aria-label="What you can do with Tidely">
        <div className={styles.asideIntro}>
          <span className={styles.badge}><span /> A fresh start for your inbox</span>
          <h2>Less noise.<br /><span>More breathing room.</span></h2>
          <p>Keep the emails you love.<br />Let go of the ones you don&rsquo;t.</p>
        </div>
        <div className={styles.preview}>
          <div className={styles.previewTop}><span><Inbox size={19} aria-hidden /> Your inbox, simplified</span><span className={styles.example}>Preview</span></div>
          {[
            { name: "The Sunday Edit", detail: "A little inspiration, once a week", letter: "S", keep: true },
            { name: "Everyday Offers", detail: "Another deal you didn't ask for", letter: "E", keep: false },
            { name: "Design Notes", detail: "Ideas worth making time for", letter: "D", keep: true },
          ].map((sender) => (
            <div className={styles.sender} key={sender.name}>
              <span className={styles.avatar}>{sender.letter}</span>
              <span className={styles.senderText}><strong>{sender.name}</strong><span>{sender.detail}</span></span>
              <span className={sender.keep ? styles.keep : styles.leave}>{sender.keep ? "Keep" : "Unsubscribe"}</span>
            </div>
          ))}
          <div className={styles.previewBottom}><Check size={16} aria-hidden /> A little tidying. A lot more clarity.</div>
        </div>
        <div className={styles.benefits}>
          <p><Mail size={18} aria-hidden /> Find your mailing lists in one place</p>
          <p><Check size={18} aria-hidden /> Choose what stays and what goes</p>
          <p><ShieldCheck size={18} aria-hidden /> See the result of every unsubscribe attempt</p>
        </div>
      </aside>
    </div>
  );
}

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M43.6 24.46c0-1.36-.12-2.66-.35-3.91H24v7.4h11a9.4 9.4 0 0 1-4.08 6.16v5h6.61c3.87-3.57 6.07-8.84 6.07-14.65Z" />
    <path fill="#34A853" d="M24 44c5.5 0 10.11-1.82 13.48-4.93l-6.61-5c-1.83 1.23-4.17 1.98-6.87 1.98-5.3 0-9.8-3.58-11.41-8.4H5.77v5.15A20 20 0 0 0 24 44Z" />
    <path fill="#FBBC05" d="M12.59 27.65A12 12 0 0 1 12 24c0-1.27.21-2.5.59-3.65V15.2H5.77A20 20 0 0 0 4 24c0 3.22.77 6.27 1.77 8.8l6.82-5.15Z" />
    <path fill="#EA4335" d="M24 11.95c3 0 5.69 1.03 7.8 3.05l5.85-5.85A19.65 19.65 0 0 0 24 4 20 20 0 0 0 5.77 15.2l6.82 5.15C14.2 15.53 18.7 11.95 24 11.95Z" />
  </svg>;
}
