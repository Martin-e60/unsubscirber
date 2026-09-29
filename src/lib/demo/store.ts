import {
  ATTEMPT_STATUS,
  SCAN_STATUS,
  SENDER_STATUS,
  UNSUBSCRIBE_METHOD,
  type AttemptStatus,
  type ScanStatus,
  type SenderStatus,
  type UnsubscribeMethod,
} from "@/lib/constants";
import {
  DEMO_SCAN_TOTAL,
  DEMO_SENDERS,
  demoManualUrl,
  type DemoOutcome,
  type DemoSenderSeed,
} from "@/lib/demo/data";

/**
 * The demo's state, and where it lives.
 *
 * It lives in this visitor's own browser and nowhere else: one person clicking
 * through the demo cannot change what the next person sees, and nothing here
 * ever reaches a server, a mailbox or a database. If localStorage is
 * unavailable — private windows, blocked site data — the same state is held in
 * memory for the tab instead, so the demo still works; it just forgets on
 * reload.
 */

const STORAGE_KEY = "tidely.demo.v1";
/**
 * Bumped when the stored shape changes. Version 2 added scan timestamps for
 * the Home screen; a visitor holding version 1 simply starts the demo afresh.
 */
const STATE_VERSION = 2;

/** The default window for a first scan, matching the real app. */
export const DEMO_DEFAULT_LOOKBACK_DAYS = 30;

/** How many messages one simulated scan step reads. */
const SCAN_STEP_MESSAGES = 480;

export type DemoSender = {
  id: string;
  name: string;
  address: string;
  messageCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sampleSubject: string;
  method: UnsubscribeMethod | null;
  oneClick: boolean;
  outcome: DemoOutcome;
  status: SenderStatus;
  decidedAt: string | null;
  manualUrl: string | null;
};

export type DemoAttempt = {
  id: string;
  senderId: string;
  method: UnsubscribeMethod;
  status: AttemptStatus;
  detail: string;
  createdAt: string;
};

export type DemoScan = {
  scanId: string;
  status: ScanStatus;
  lookbackDays: number;
  processedMessages: number;
  matchedMessages: number;
  totalEstimate: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type DemoState = {
  version: number;
  senders: DemoSender[];
  attempts: DemoAttempt[];
  scan: DemoScan | null;
  /** Reserve senders already revealed by a longer scan. */
  revealed: string[];
};

const dayMs = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * dayMs).toISOString();

function toSender(seed: DemoSenderSeed): DemoSender {
  const status = seed.status ?? SENDER_STATUS.ACTIVE;
  return {
    id: seed.id,
    name: seed.name,
    address: seed.address,
    messageCount: seed.messageCount,
    firstSeenAt: iso(seed.firstSeenDaysAgo),
    lastSeenAt: iso(seed.lastSeenDaysAgo),
    sampleSubject: seed.sampleSubject,
    method: seed.method,
    oneClick: Boolean(seed.oneClick),
    outcome: seed.outcome,
    status,
    decidedAt: seed.decidedDaysAgo !== undefined ? iso(seed.decidedDaysAgo) : null,
    manualUrl: status === SENDER_STATUS.MANUAL ? demoManualUrl(seed.id) : null,
  };
}

/** Wording copied from the real engine, so the demo does not read differently. */
export function attemptDetail(
  outcome: DemoOutcome,
  sender: { address: string; method: UnsubscribeMethod | null; oneClick: boolean },
): string {
  if (!sender.method) {
    return "This sender publishes no unsubscribe method we can use.";
  }
  switch (outcome) {
    case "SUCCESS":
      return sender.oneClick
        ? "One-click unsubscribe accepted (HTTP 200)."
        : "The unsubscribe page confirmed you were removed.";
    case "SENT":
      return `Unsubscribe email sent to unsubscribe@${
        sender.address.split("@")[1]
      }. Removal is not confirmed; this list may still send emails.`;
    case "MANUAL":
      return "Opened the unsubscribe page, but it needs one more click.";
    case "FAILED":
      return "The unsubscribe endpoint returned HTTP 500.";
  }
}

/** The seed state: a mailbox that has already been scanned once. */
export function initialState(): DemoState {
  const senders = DEMO_SENDERS.filter((seed) => !seed.reserve).map(toSender);

  const attempts: DemoAttempt[] = [];
  for (const sender of senders) {
    if (!sender.decidedAt) continue;

    if (sender.status === SENDER_STATUS.UNSUBSCRIBED) {
      attempts.push({
        id: `seed-${sender.id}`,
        senderId: sender.id,
        method: sender.oneClick ? UNSUBSCRIBE_METHOD.ONE_CLICK : UNSUBSCRIBE_METHOD.HTTP,
        status: ATTEMPT_STATUS.SUCCESS,
        detail: sender.oneClick
          ? "One-click unsubscribe accepted (HTTP 200)."
          : "The unsubscribe page confirmed you were removed.",
        createdAt: sender.decidedAt,
      });
    } else if (sender.status === SENDER_STATUS.REQUESTED) {
      attempts.push({
        id: `seed-${sender.id}`,
        senderId: sender.id,
        method: UNSUBSCRIBE_METHOD.MAILTO,
        status: ATTEMPT_STATUS.SENT,
        detail: `Unsubscribe email sent to unsubscribe@${
          sender.address.split("@")[1]
        }. Removal is not confirmed; this list may still send emails.`,
        createdAt: sender.decidedAt,
      });
    } else if (sender.status === SENDER_STATUS.MANUAL) {
      attempts.push({
        id: `seed-${sender.id}`,
        senderId: sender.id,
        method: UNSUBSCRIBE_METHOD.HTTP,
        status: ATTEMPT_STATUS.MANUAL_REQUIRED,
        detail: sender.manualUrl ?? demoManualUrl(sender.id),
        createdAt: sender.decidedAt,
      });
    } else if (sender.status === SENDER_STATUS.FAILED) {
      attempts.push({
        id: `seed-${sender.id}`,
        senderId: sender.id,
        method: UNSUBSCRIBE_METHOD.HTTP,
        status: ATTEMPT_STATUS.FAILED,
        detail: "The unsubscribe endpoint returned HTTP 500.",
        createdAt: sender.decidedAt,
      });
    }
  }

  return {
    version: STATE_VERSION,
    senders,
    attempts: attempts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    scan: {
      scanId: "demo-scan-seed",
      status: SCAN_STATUS.DONE,
      lookbackDays: DEMO_DEFAULT_LOOKBACK_DAYS,
      processedMessages: DEMO_SCAN_TOTAL,
      matchedMessages: senders.reduce((total, s) => total + s.messageCount, 0),
      totalEstimate: DEMO_SCAN_TOTAL,
      error: null,
      // The sample mailbox was "scanned" a few minutes before the visit began.
      startedAt: new Date(Date.now() - 9 * 60_000).toISOString(),
      finishedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    },
    revealed: [],
  };
}

// --- Persistence ------------------------------------------------------------

let memoryState: DemoState | null = null;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__tidely_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private window, or site data blocked. Fall back to memory.
    return null;
  }
}

export function loadState(): DemoState {
  if (memoryState) return memoryState;

  const store = storage();
  if (store) {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (parsed?.version === STATE_VERSION && Array.isArray(parsed.senders)) {
          memoryState = parsed;
          return parsed;
        }
      }
    } catch {
      // Corrupt or foreign value — start the demo over rather than crash.
    }
  }

  memoryState = initialState();
  saveState(memoryState);
  return memoryState;
}

export function saveState(state: DemoState): void {
  memoryState = state;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or a blocked write; the in-memory copy is still correct.
  }
}

export function mutate(change: (state: DemoState) => void): DemoState {
  const state = loadState();
  change(state);
  saveState(state);
  return state;
}

/** Throws the demo back to its starting point. */
export function clearState(): void {
  memoryState = null;
  const store = storage();
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

// --- Scanning ---------------------------------------------------------------

export function startDemoScan(lookbackDays: number): DemoScan {
  const scan: DemoScan = {
    scanId: `demo-scan-${Date.now()}`,
    status: SCAN_STATUS.RUNNING,
    lookbackDays,
    processedMessages: 0,
    matchedMessages: 0,
    totalEstimate: Math.max(
      SCAN_STEP_MESSAGES * 3,
      Math.round(DEMO_SCAN_TOTAL * Math.min(4, lookbackDays / DEMO_DEFAULT_LOOKBACK_DAYS)),
    ),
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  mutate((state) => {
    state.scan = scan;
  });
  return scan;
}

/**
 * Advances a running scan by one step.
 *
 * On the final step, a scan that looked further back than the default window
 * turns up the senders held in reserve — so changing the lookback has a visible
 * consequence rather than being a decorative control.
 */
export function stepDemoScan(): DemoScan {
  const state = loadState();
  const scan = state.scan;
  if (!scan) throw new Error("No scan to continue. Start one first.");
  if (scan.status !== SCAN_STATUS.RUNNING) return scan;

  scan.processedMessages = Math.min(
    scan.totalEstimate,
    scan.processedMessages + SCAN_STEP_MESSAGES,
  );
  scan.matchedMessages = state.senders.reduce((t, s) => t + s.messageCount, 0);

  if (scan.processedMessages >= scan.totalEstimate) {
    if (scan.lookbackDays > DEMO_DEFAULT_LOOKBACK_DAYS) {
      for (const seed of DEMO_SENDERS) {
        if (!seed.reserve) continue;
        if (state.revealed.includes(seed.id)) continue;
        if (seed.lastSeenDaysAgo > scan.lookbackDays) continue;
        state.revealed.push(seed.id);
        state.senders.push(toSender(seed));
      }
      scan.matchedMessages = state.senders.reduce((t, s) => t + s.messageCount, 0);
    }
    scan.status = SCAN_STATUS.DONE;
    scan.finishedAt = new Date().toISOString();
  }

  saveState(state);
  return scan;
}
