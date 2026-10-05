"use client";

import { createContext, useContext } from "react";
import type { MailboxDto } from "@/lib/api/types";

/**
 * The connected mailboxes and which one this tab is looking at.
 *
 * Provided by AppShell above the per-mailbox part of the page, so the
 * switcher, Settings and anything else that lists mailboxes share one copy.
 * Everything below the per-mailbox boundary is mounted fresh for each
 * mailbox; see AppShell for why.
 */

export type MailboxContextValue = {
  /** Connected mailboxes, oldest first. Empty while loading or when none is connected. */
  mailboxes: MailboxDto[];
  /** The mailbox this tab is using, or null when none is connected (or still loading). */
  active: MailboxDto | null;
  /** True until the session has loaded and a mailbox has been chosen. */
  loading: boolean;
  /** Inside the public demo: sample mailboxes, nothing to add or manage. */
  demo: boolean;
  /** Where the app is mounted: "" or "/demo". */
  basePath: string;
  /** Switches this tab to another mailbox. Other tabs are not affected. */
  switchTo: (mailboxId: string) => void;
  /** True while something started in the current mailbox is still running. */
  isBusy: () => boolean;
  /** Re-reads the list of mailboxes from the server. */
  refresh: () => Promise<void>;
  /** Gives a mailbox a name (or clears it with null). */
  rename: (mailboxId: string, label: string | null) => Promise<MailboxDto>;
  /** Disconnects one mailbox. If it was this tab's, the tab moves to another. */
  remove: (mailboxId: string) => Promise<void>;
};

const noop = () => {};

export const MailboxContext = createContext<MailboxContextValue>({
  mailboxes: [],
  active: null,
  loading: true,
  demo: false,
  basePath: "",
  switchTo: noop,
  isBusy: () => false,
  refresh: async () => {},
  rename: async () => {
    throw new Error("No mailbox context");
  },
  remove: async () => {},
});

export function useMailboxes(): MailboxContextValue {
  return useContext(MailboxContext);
}

/**
 * Long-running work in the current mailbox — a scan, a bulk unsubscribe, a
 * Clear out action — registers here while it runs, so switching mailbox
 * first asks whether to stop it. `begin()` returns the function that ends it.
 */
export const MailboxOperationContext = createContext<() => () => void>(() => noop);

export function useMailboxOperation(): () => () => void {
  return useContext(MailboxOperationContext);
}

/** This tab's mailbox survives a reload of the tab, and nothing else. */
const TAB_KEY = "tidely.mailbox";
const DEMO_TAB_KEY = "tidely.demo.mailbox";

export function readTabMailbox(demo: boolean): string | null {
  try {
    return window.sessionStorage.getItem(demo ? DEMO_TAB_KEY : TAB_KEY);
  } catch {
    return null;
  }
}

export function writeTabMailbox(demo: boolean, mailboxId: string | null): void {
  try {
    const key = demo ? DEMO_TAB_KEY : TAB_KEY;
    if (mailboxId) window.sessionStorage.setItem(key, mailboxId);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: the tab simply starts on the remembered mailbox next time.
  }
}
