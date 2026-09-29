"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import styles from "./AccountMenu.module.css";

/**
 * Who is signed in, and the way out.
 *
 * Lives at the foot of the sidebar on wide screens and in the small top bar
 * on phones — the same component in both places, so signing out never moves
 * behind a different control depending on the window size.
 */

export function initialsOf(value: string): string {
  const cleaned = value.replace(/@.*$/, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "Sam Rivers" → "Sam R."; an address → the part before the @. */
export function shortName(value: string): string {
  if (value.includes("@")) return value.split("@")[0];
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return value;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function AccountMenu({
  name,
  email,
  onSignOut,
  signOutLabel = "Sign out",
  placement = "up",
  compact = false,
}: {
  name: string | null;
  email: string | null;
  onSignOut: () => void;
  signOutLabel?: string;
  /** Which way the menu opens: up from the sidebar foot, down from a top bar. */
  placement?: "up" | "down";
  /** Avatar only — for the icon rail and the phone bar. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const display = name ?? email ?? "Account";

  useEffect(() => {
    if (!open) return;
    firstItem.current?.focus();

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
    <div className={styles.root} ref={root} data-compact={compact || undefined}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={compact ? `Account: ${display}` : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initialsOf(display)}
        </span>
        <span className={styles.who}>
          <span className={styles.name}>{shortName(display)}</span>
          {email ? <span className={styles.email}>{email}</span> : null}
        </span>
        <ChevronDown
          className={styles.chevron}
          size={16}
          strokeWidth={1.75}
          aria-hidden
          data-open={open || undefined}
        />
      </button>

      {open ? (
        <div id={menuId} role="menu" className={styles.menu} data-placement={placement}>
          {email ? <p className={styles.menuEmail}>{email}</p> : null}
          <button
            ref={firstItem}
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut size={16} strokeWidth={1.75} aria-hidden />
            {signOutLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
