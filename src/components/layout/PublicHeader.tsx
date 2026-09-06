"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { FEATURES } from "@/lib/features";
import styles from "./PublicHeader.module.css";

export function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  const dropdown = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (dropdown.current && !dropdown.current.contains(event.target as Node)) {
        dropdown.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dropdown.current?.open) {
        dropdown.current.open = false;
        dropdown.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="Tidely home"><Logo /></Link>
      <nav className={styles.nav} aria-label="Main">
        <details ref={dropdown} className={styles.dropdown}>
          <summary className={styles.trigger}>
            Features <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className={styles.menu}>
            {FEATURES.map((feature) => (
              <Link
                key={feature.slug}
                href={`/features/${feature.slug}`}
                onClick={() => { if (dropdown.current) dropdown.current.open = false; }}
              >
                {feature.name}
              </Link>
            ))}
          </div>
        </details>
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/pricing">Pricing</Link>
        {signedIn ? (
          <Link href="/connect" className={styles.cta}>Connect inbox</Link>
        ) : (
          <>
            <Link href="/login">Sign in</Link>
            <Link href="/register" className={styles.cta}>Get started</Link>
          </>
        )}
      </nav>
    </header>
  );
}
