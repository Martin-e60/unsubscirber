"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, CircleAlert, Mail, Plus, Settings } from "lucide-react";
import { useMailboxes } from "@/components/layout/MailboxContext";
import type { MailboxDto } from "@/lib/api/types";
import { addMailboxHref, mailboxTitle } from "@/lib/mailbox/shared";
import styles from "./MailboxSwitcher.module.css";

/**
 * Which mailbox this tab is looking at, and the way to change it.
 *
 * Under the logo in the sidebar (an icon in the narrow rail), and in the top
 * bar on phones. Closed, it is one compact field — icon, the active mailbox,
 * a chevron — so the navigation sits right under it. Open, the list floats
 * over the page instead of pushing the navigation down: every connected
 * mailbox with a tick beside the active one, then "Add Gmail account" and
 * "Manage mailboxes".
 *
 * It is a menu button: Enter, Space or the arrow keys open it, the arrow
 * keys, Home and End move through it, Escape closes it and returns focus,
 * and a click outside closes it. Switching while a scan, unsubscribe or Clear
 * out action is still running asks first, because switching stops it.
 */

/** Which switcher started a switch, so the new one can take focus back. */
let focusAfterSwitch: "sidebar" | "bar" | null = null;

const GUTTER = 16;

export function MailboxSwitcher({ placement }: { placement: "sidebar" | "bar" }) {
  const { mailboxes, active, loading, demo, switchTo, isBusy } = useMailboxes();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<MailboxDto | null>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // The switch remounts this component; give focus back to the same one.
  useEffect(() => {
    if (focusAfterSwitch === placement) {
      focusAfterSwitch = null;
      trigger.current?.focus();
    }
  }, [placement]);

  const place = useCallback(() => {
    const button = trigger.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rail = placement === "sidebar" && rect.width < 120;

    let left: number;
    let top: number;
    let width: number;
    if (rail) {
      // The narrow icon rail: open beside it.
      left = rect.right + 8;
      top = rect.top;
      width = Math.min(300, vw - left - GUTTER);
    } else if (placement === "bar") {
      width = Math.min(340, vw - GUTTER * 2);
      left = Math.max(GUTTER, Math.min(rect.left, vw - width - GUTTER));
      top = rect.bottom + 8;
    } else {
      width = Math.min(Math.max(rect.width, 280), vw - rect.left - GUTTER);
      left = rect.left;
      top = rect.bottom + 6;
    }
    setPosition({ left, top, width, maxBlockSize: Math.max(160, vh - top - GUTTER) });
  }, [placement]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setConfirming(null);
    if (returnFocus) trigger.current?.focus();
  }, []);

  const items = () =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? []);

  const pendingFocus = useRef<"active" | "first" | "last" | null>(null);
  const openMenu = (focus: "active" | "first" | "last" = "active") => {
    place();
    setOpen(true);
    pendingFocus.current = focus;
  };

  // On opening, focus the active mailbox (or the first/last item).
  useLayoutEffect(() => {
    if (!open || !pendingFocus.current) return;
    const all = items();
    const target =
      pendingFocus.current === "first"
        ? all[0]
        : pendingFocus.current === "last"
          ? all.at(-1)
          : menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? all[0];
    pendingFocus.current = null;
    target?.focus();
  }, [open]);

  // While open: outside clicks, Escape, and keeping the menu next to its button.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menu.current?.contains(target) || trigger.current?.contains(target)) return;
      close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    const onMove = () => place();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, close, place]);

  // The confirmation takes focus on its safe choice, "Stay".
  useEffect(() => {
    if (confirming) menu.current?.querySelector<HTMLElement>("[data-stay]")?.focus();
  }, [confirming]);

  const doSwitch = (mailbox: MailboxDto) => {
    setOpen(false);
    setConfirming(null);
    focusAfterSwitch = placement;
    switchTo(mailbox.id);
  };

  const choose = (mailbox: MailboxDto) => {
    if (mailbox.id === active?.id) {
      close(true);
      return;
    }
    if (isBusy()) {
      setConfirming(mailbox);
      return;
    }
    doSwitch(mailbox);
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      all[(next + all.length) % all.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index < 0 ? all.length - 1 : index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(all.length - 1);
    else if (event.key === "Tab") close(false);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu("active");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    }
  };

  /* --- Closed states ----------------------------------------------------------------- */

  if (loading) {
    return (
      <div className={styles.root} data-placement={placement}>
        <span className={styles.trigger} data-state="loading" aria-hidden="true">
          <Mail className={styles.icon} size={20} strokeWidth={1.75} />
          <span className={styles.text}>
            <span className={styles.skeleton} />
          </span>
        </span>
        <span className="srOnly" role="status">Loading mailboxes</span>
      </div>
    );
  }

  if (!active) {
    // Nothing connected (yet, or any more): the same spot offers to connect.
    if (demo) return null;
    return (
      <div className={styles.root} data-placement={placement}>
        <Link href="/connect" className={styles.trigger} data-state="empty" aria-label="Connect Gmail">
          <Mail className={styles.icon} size={20} strokeWidth={1.75} aria-hidden />
          <span className={styles.text}>
            <span className={styles.title}>Connect Gmail</span>
          </span>
          <Plus className={styles.chevron} size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>
    );
  }

  const title = mailboxTitle(active);
  const nextPath = demo ? null : pathname;

  return (
    <div className={styles.root} data-placement={placement}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Mailbox: ${title}${active.label ? `, ${active.email}` : ""}${
          active.needsReconnect ? ", needs reconnecting" : ""
        }. Change mailbox`}
        title={active.label ? `${active.label} · ${active.email}` : active.email}
        onClick={() => (open ? close(false) : openMenu("active"))}
        onKeyDown={onTriggerKeyDown}
      >
        <Mail className={styles.icon} size={20} strokeWidth={1.75} aria-hidden />
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          {active.label ? <span className={styles.sub}>{active.email}</span> : null}
        </span>
        {active.needsReconnect ? (
          <CircleAlert className={styles.alert} size={16} strokeWidth={2} aria-hidden />
        ) : null}
        <ChevronDown
          className={styles.chevron}
          size={18}
          strokeWidth={1.75}
          aria-hidden
          data-open={open || undefined}
        />
      </button>

      {open && position ? (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="Your mailboxes"
          className={styles.menu}
          style={position}
          onKeyDown={onMenuKeyDown}
        >
          <p className={styles.heading} aria-hidden="true">
            {demo ? "Sample mailboxes" : "Your mailboxes"}
          </p>

          {mailboxes.map((mailbox) => {
            const current = mailbox.id === active.id;
            return (
              <button
                key={mailbox.id}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                data-menu-item
                className={styles.option}
                onClick={() => choose(mailbox)}
              >
                <Mail className={styles.optionIcon} size={18} strokeWidth={1.75} aria-hidden />
                <span className={styles.text}>
                  <span className={styles.optionTitle}>{mailboxTitle(mailbox)}</span>
                  {mailbox.label ? <span className={styles.sub}>{mailbox.email}</span> : null}
                  {mailbox.needsReconnect ? (
                    <span className={styles.badge}>Needs reconnecting</span>
                  ) : null}
                </span>
                {current ? (
                  <Check className={styles.check} size={18} strokeWidth={2} aria-hidden />
                ) : null}
              </button>
            );
          })}

          {confirming ? (
            <div className={styles.confirm} role="group" aria-label="Switch mailbox?">
              <p>
                Something is still running in <strong>{title}</strong>. Switching
                to <strong>{mailboxTitle(confirming)}</strong> stops it after the
                current step; what already finished stays done.
              </p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  data-menu-item
                  data-stay
                  className={styles.secondary}
                  onClick={() => setConfirming(null)}
                >
                  Stay
                </button>
                <button
                  type="button"
                  data-menu-item
                  className={styles.primary}
                  onClick={() => doSwitch(confirming)}
                >
                  Switch anyway
                </button>
              </div>
            </div>
          ) : null}

          <div className={styles.separator} role="separator" />

          {demo ? (
            <>
              <p className={styles.note}>
                Both are invented. Nothing here touches a real mailbox.
              </p>
              <Link
                href="/register"
                role="menuitem"
                data-menu-item
                className={`${styles.action} ${styles.add}`}
                onClick={() => setOpen(false)}
              >
                <Plus size={18} strokeWidth={2} aria-hidden />
                Use your own Gmail
              </Link>
            </>
          ) : (
            <>
              <Link
                href={addMailboxHref(nextPath)}
                role="menuitem"
                data-menu-item
                className={`${styles.action} ${styles.add}`}
                onClick={() => setOpen(false)}
              >
                <Plus size={18} strokeWidth={2} aria-hidden />
                Add Gmail account
              </Link>
              <div className={styles.separator} role="separator" />
              <Link
                href="/settings#mailboxes"
                role="menuitem"
                data-menu-item
                className={`${styles.action} ${styles.manage}`}
                onClick={() => setOpen(false)}
              >
                <Settings size={18} strokeWidth={1.75} aria-hidden />
                Manage mailboxes
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
