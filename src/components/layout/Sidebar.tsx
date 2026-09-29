"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleHelp,
  Home,
  ListFilter,
  MailCheck,
  Mails,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { DEMO_NAV, NAV, navHref, type NavId, type NavItem } from "@/lib/navigation";
import styles from "./Sidebar.module.css";

/**
 * Primary navigation for the signed-in app and the demo.
 *
 * Wide screens: a light sidebar — workspace links at the top, Settings and
 * Help below a divider, and the account at the foot. Below 64rem it becomes
 * an icon rail; below 44rem a bottom tab bar, with the account moving to the
 * small top bar that AppShell shows on phones. All of that is stylesheet work;
 * the links are rendered once.
 */

const ICONS: Record<NavId, LucideIcon> = {
  home: Home,
  cleanup: ListFilter,
  senders: Users,
  unsubscribed: MailCheck,
  settings: SlidersHorizontal,
};

/** Re-exported so callers do not need two imports to render a sidebar. */
export { NAV, DEMO_NAV };

export type SidebarAccount = {
  name: string | null;
  email: string | null;
  onSignOut: () => void;
  signOutLabel?: string;
};

export function Sidebar({
  basePath = "",
  items = NAV,
  cleanupCount = null,
  account,
}: {
  basePath?: string;
  items?: NavItem[];
  /** Senders waiting on a decision — shown beside Cleanup when above zero. */
  cleanupCount?: number | null;
  account: SidebarAccount;
}) {
  const pathname = usePathname();
  const main = items.filter((item) => item.id !== "settings");
  const settings = items.find((item) => item.id === "settings");

  const link = (item: NavItem, extra?: React.ReactNode) => {
    const Icon = ICONS[item.id];
    const target = navHref(item, basePath);
    const active = pathname === target;

    return (
      <Link
        href={target}
        className={styles.item}
        data-active={active || undefined}
        aria-current={active ? "page" : undefined}
      >
        <span className={styles.iconWrap}>
          <Icon className={styles.icon} size={20} strokeWidth={1.75} aria-hidden />
          {extra}
        </span>
        <span className={styles.label}>{item.label}</span>
      </Link>
    );
  };

  const count =
    cleanupCount !== null && cleanupCount > 0 ? (
      <span className={styles.count}>
        {cleanupCount > 99 ? "99+" : cleanupCount}
        <span className="srOnly"> waiting</span>
      </span>
    ) : null;

  return (
    <aside className={styles.sidebar}>
      <Link href={navHref(NAV[0], basePath)} className={styles.brand} aria-label="Tidely home">
        <span className={styles.mark} aria-hidden="true">
          <Mails size={20} strokeWidth={1.9} />
        </span>
        <span className={styles.word}>tidely.</span>
      </Link>

      <p className={styles.section}>Your workspace</p>

      <nav className={styles.nav} aria-label="Main">
        {main.map((item) => (
          <div key={item.id} className={styles.slot}>
            {link(item, item.id === "cleanup" ? count : null)}
          </div>
        ))}
      </nav>

      <div className={styles.foot}>
        <nav className={styles.secondary} aria-label="Settings and help">
          {settings ? <div className={styles.slot}>{link(settings)}</div> : null}
          <div className={`${styles.slot} ${styles.help}`}>
            <Link href="/privacy" className={styles.item}>
              <span className={styles.iconWrap}>
                <CircleHelp className={styles.icon} size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <span className={styles.label}>Help &amp; privacy</span>
            </Link>
          </div>
        </nav>

        <div className={styles.accountFull}>
          <AccountMenu {...account} placement="up" />
        </div>
        <div className={styles.accountCompact}>
          <AccountMenu {...account} placement="up" compact />
        </div>
      </div>
    </aside>
  );
}
