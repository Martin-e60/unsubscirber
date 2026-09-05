"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Sparkles,
  Users,
  Layers,
  MailX,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import styles from "./Sidebar.module.css";

/**
 * Primary navigation.
 *
 * Below 64rem the labels drop away and it becomes an icon rail; below 44rem it
 * moves to the bottom of the screen as a tab bar. All of that lives in the
 * stylesheet — this component just renders links.
 */

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/cleanup", label: "Cleanup", icon: Sparkles },
  { href: "/senders", label: "Senders", icon: Users },
  { href: "/rollups", label: "Rollups", icon: Layers },
  { href: "/unsubscribed", label: "Unsubscribed", icon: MailX },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ inboxHealth }: { inboxHealth: number | null }) {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Link href="/dashboard" className={styles.brandLink}>
          <Logo />
        </Link>
      </div>

      <nav className={styles.nav} aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={styles.item}
            data-active={pathname === href || undefined}
          >
            <Icon className={styles.icon} size={18} strokeWidth={1.75} aria-hidden />
            <span className={styles.label}>{label}</span>
          </Link>
        ))}
      </nav>

      {inboxHealth !== null ? (
        <div className={styles.health}>
          <p className={styles.healthLabel}>Inbox Health</p>
          <p className={styles.healthScore}>
            {inboxHealth}
            <span className={styles.healthMax}> / 100</span>
          </p>
          <div className={styles.healthTrack}>
            <div
              className={styles.healthFill}
              style={{ inlineSize: `${Math.min(100, Math.max(0, inboxHealth))}%` }}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
