"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import styles from "./TopBar.module.css";

/**
 * Search plus the account menu.
 *
 * Submitting the search sends you to the Senders page with the query applied,
 * so there is one list implementation rather than two.
 */

export function TopBar({
  name,
  email,
  onSignOut,
}: {
  name: string | null;
  email: string | null;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const display = name ?? email ?? "Account";

  return (
    <header className={styles.topbar}>
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = query.trim();
          router.push(
            trimmed ? `/senders?search=${encodeURIComponent(trimmed)}` : "/senders",
          );
        }}
      >
        <Search className={styles.searchIcon} size={16} strokeWidth={1.75} aria-hidden />
        <label className="srOnly" htmlFor="global-search">
          Search your inbox
        </label>
        <input
          id="global-search"
          type="search"
          className={styles.searchInput}
          placeholder="Search your inbox..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      <div className={styles.account} ref={menuRef}>
        <button
          type="button"
          className={styles.accountButton}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Avatar name={display} size="sm" />
          <span className={styles.accountName}>{shortName(display)}</span>
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
        </button>

        {menuOpen ? (
          <div className={styles.menu} role="menu">
            <p className={styles.menuEmail}>{email}</p>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={onSignOut}
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** "Michael Kowalski" becomes "Michael K." — the mockup's treatment. */
function shortName(value: string): string {
  if (value.includes("@")) return value.split("@")[0];
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return value;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
