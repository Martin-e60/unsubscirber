"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Sparkles,
  Users,
  MailX,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { DEMO_NAV, NAV, navHref, type NavId, type NavItem } from "@/lib/navigation";
import styles from "./Sidebar.module.css";

/**
 * Primary navigation.
 *
 * Below 64rem the labels drop away and it becomes an icon rail; below 44rem it
 * moves to the bottom of the screen as a tab bar. All of that lives in the
 * stylesheet — this component just renders links.
 */

const ICONS: Record<NavId, LucideIcon> = {
  home: Home,
  cleanup: Sparkles,
  senders: Users,
  unsubscribed: MailX,
  settings: Settings,
};

/** Re-exported so callers do not need two imports to render a sidebar. */
export { NAV, DEMO_NAV };

export function Sidebar({
  inboxHealth,
  basePath = "",
  items = NAV,
}: {
  inboxHealth: number | null;
  basePath?: string;
  items?: NavItem[];
}) {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Link href={navHref(NAV[0], basePath)} className={styles.brandLink}>
          <Logo />
        </Link>
      </div>

      <nav className={styles.nav} aria-label="Main">
        {items.map((item) => {
          const Icon = ICONS[item.id];
          const target = navHref(item, basePath);
          const active = pathname === target;
          return (
          <Link
            key={item.id}
            href={target}
            className={styles.item}
            data-active={active || undefined}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
          >
            <Icon className={styles.icon} size={18} strokeWidth={1.75} aria-hidden />
            <span className={styles.label}>{item.label}</span>
          </Link>
          );
        })}
      </nav>

      {inboxHealth !== null ? (
        <div className={styles.health}>
          <p className={styles.healthLabel}>
            Inbox Health <span className={styles.healthHint}>(estimate)</span>
          </p>
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
