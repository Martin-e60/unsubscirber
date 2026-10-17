"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, SlidersHorizontal, User } from "lucide-react";
import { MailboxSwitcher } from "@/components/layout/MailboxSwitcher";
import { NAV, navHref, type NavItem } from "@/lib/navigation";
import type { SidebarAccount } from "@/components/layout/Sidebar";
import styles from "./HomeHeader.module.css";

/**
 * The header of application Home: Tidely on the left, the five destinations
 * in the middle, the account on the right.
 *
 * Home is the one page without a sidebar, so what the sidebar carried has to
 * live somewhere. The destinations are the nav; the mailbox switcher, Settings
 * and the way out sit in the account menu. Nothing is new — they are the same
 * links and the same switcher, moved.
 */

export function HomeHeader({
  basePath = "",
  items = NAV,
  account,
}: {
  basePath?: string;
  items?: NavItem[];
  account: SidebarAccount;
}) {
  const pathname = usePathname();
  const main = items.filter((item) => item.id !== "settings");
  const settings = items.find((item) => item.id === "settings");

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={navHref(NAV[0], basePath)} className={styles.brand} aria-label="Tidely home">
          Tidely
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {main.map((item) => {
            const target = navHref(item, basePath);
            const active = pathname === target;
            return (
              <Link
                key={item.id}
                href={target}
                className={styles.link}
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/privacy" className={styles.link}>
            Help &amp; privacy
          </Link>
        </nav>

        <HomeAccountMenu
          {...account}
          settingsHref={settings ? navHref(settings, basePath) : null}
        />
      </div>
    </header>
  );
}

function HomeAccountMenu({
  name,
  email,
  onSignOut,
  signOutLabel = "Sign out",
  settingsHref,
}: SidebarAccount & { settingsHref: string | null }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const display = name ?? email ?? "Account";

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.account} ref={root}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account: ${display}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.avatar} aria-hidden="true">
          <User size={22} strokeWidth={2} />
        </span>
        <ChevronDown
          className={styles.chevron}
          size={20}
          strokeWidth={2.25}
          aria-hidden
          data-open={open || undefined}
        />
      </button>

      {open ? (
        <div id={menuId} role="menu" className={styles.menu}>
          {email ? <p className={styles.menuEmail}>{email}</p> : null}
          <div className={styles.switcher}>
            <MailboxSwitcher placement="bar" />
          </div>
          {settingsHref ? (
            <Link
              href={settingsHref}
              role="menuitem"
              className={styles.item}
              onClick={() => setOpen(false)}
            >
              <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden />
              Settings
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden />
            {signOutLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
