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
  DEMO_ACCOUNT,
  DEMO_FOLLOW_UPS,
  DEMO_MAILBOXES,
  DEMO_SCAN_TOTAL,
  DEMO_SENDERS,
  demoManualUrl,
  type DemoFollowUpSeed,
  type DemoMailboxId,
  type DemoOutcome,
  type DemoSenderSeed,
} from "@/lib/demo/data";
import { demoMailboxSeeds, type DemoMessageSeed } from "@/lib/demo/mailbox";
import { DEMO_WORK_SCAN_TOTAL, DEMO_WORK_SENDERS, demoWorkMailboxSeeds } from "@/lib/demo/work";
import type { ClearOutAction } from "@/lib/clearout/actions";

/**
 * The demo's state, and where it lives.
 *
 * It lives in this visitor's own browser and nowhere else: one person clicking
 * through the demo cannot change what the next person sees, and nothing here
 * ever reaches a server, a mailbox or a database. If localStorage is
 * unavailable — private windows, blocked site data — the same state is held in
 * memory for the tab instead, so the demo still works; it just forgets on
 * reload.
 *
 * Each sample mailbox has its own state under its own key, exactly as each
 * real mailbox has its own rows: nothing done in one is visible in the other.
 * Every function takes the mailbox it acts on; without one, it is the first.
 */

const STORAGE_KEY = "tidely.demo.v1";
const DEFAULT_BOX: DemoMailboxId = DEMO_ACCOUNT.id as DemoMailboxId;

/** The personal mailbox keeps the original key, so a visitor's demo carries on. */
function storageKey(box: DemoMailboxId): string {
  return box === DEFAULT_BOX ? STORAGE_KEY : `${STORAGE_KEY}.${box}`;
}

/** What each sample mailbox starts with. */
const SEEDS: Record<
  DemoMailboxId,
  {
    senders: DemoSenderSeed[];
    followUps: DemoFollowUpSeed[];
    scanTotal: number;
    messages: () => DemoMessageSeed[];
  }
> = {
  "demo-mailbox": {
    senders: DEMO_SENDERS,
    followUps: DEMO_FOLLOW_UPS,
    scanTotal: DEMO_SCAN_TOTAL,
    messages: demoMailboxSeeds,
  },
  "demo-work": {
    senders: DEMO_WORK_SENDERS,
    followUps: [],
    scanTotal: DEMO_WORK_SCAN_TOTAL,
    messages: demoWorkMailboxSeeds,
  },
};
/**
 * Bumped when the stored shape changes. Version 2 added scan timestamps for
 * the Home screen; version 3 added mail received after an unsubscribe;
 * version 4 added Clear out's mailbox and its History. A visitor holding an
 * older version simply starts the demo afresh.
 */
const STATE_VERSION = 4;

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

/** A sample message that arrived after a confirmed unsubscribe. */
export type DemoFollowUp = {
  id: string;
  senderId: string;
  subject: string;
  receivedAt: string;
};

/** One sample message in Clear out. Changes only ever touch this copy. */
export type DemoMessage = Omit<DemoMessageSeed, "daysAgo"> & { receivedAt: string };

/** One Clear out action in the demo's History. */
export type DemoClearOutRun = {
  id: string;
  action: ClearOutAction;
  labelId: string | null;
  labelName: string | null;
  requested: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  updatedAt: string;
};

export type DemoState = {
  version: number;
  senders: DemoSender[];
  attempts: DemoAttempt[];
  followUps: DemoFollowUp[];
  /**
   * The last scan that finished. Kept apart from `scan`, which a new scan
   * replaces: a check that is running or was abandoned must not wipe out
   * what the last completed one found — the real app keeps every scan row.
   */
  lastDone: DemoScan | null;
  scan: DemoScan | null;
  /** Reserve senders already revealed by a longer scan. */
  revealed: string[];
  /** Clear out's sample mailbox, and what was done to it. */
  mailbox: DemoMessage[];
  clearOutRuns: DemoClearOutRun[];
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
export function initialState(box: DemoMailboxId = DEFAULT_BOX): DemoState {
  const seeds = SEEDS[box];
  const senders = seeds.senders.filter((seed) => !seed.reserve).map(toSender);

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

  const seedScan: DemoScan = {
    scanId: "demo-scan-seed",
    status: SCAN_STATUS.DONE,
    lookbackDays: DEMO_DEFAULT_LOOKBACK_DAYS,
    processedMessages: seeds.scanTotal,
    matchedMessages: senders.reduce((total, s) => total + s.messageCount, 0),
    totalEstimate: seeds.scanTotal,
    error: null,
    // The sample mailbox was "scanned" a few minutes before the visit began.
    startedAt: new Date(Date.now() - 9 * 60_000).toISOString(),
    finishedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
  };

  return {
    version: STATE_VERSION,
    senders,
    attempts: attempts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    followUps: seeds.followUps.map((seed) => ({
      id: seed.id,
      senderId: seed.senderId,
      subject: seed.subject,
      receivedAt: iso(seed.receivedDaysAgo),
    })),
    scan: seedScan,
    lastDone: { ...seedScan },
    revealed: [],
    mailbox: seeds.messages().map(({ daysAgo, ...seed }) => ({
      ...seed,
      receivedAt: new Date(Date.now() - daysAgo * dayMs).toISOString(),
    })),
    // History starts empty: nothing was done before the visit.
    clearOutRuns: [],
  };
}

// --- Persistence ------------------------------------------------------------

const memoryState = new Map<DemoMailboxId, DemoState>();

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

export function loadState(box: DemoMailboxId = DEFAULT_BOX): DemoState {
  const held = memoryState.get(box);
  if (held) return held;

  const store = storage();
  if (store) {
    try {
      const raw = store.getItem(storageKey(box));
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (
          parsed?.version === STATE_VERSION &&
          Array.isArray(parsed.senders) &&
          Array.isArray(parsed.followUps) &&
          Array.isArray(parsed.mailbox) &&
          Array.isArray(parsed.clearOutRuns) &&
          "lastDone" in parsed
        ) {
          memoryState.set(box, parsed);
          return parsed;
        }
      }
    } catch {
      // Corrupt or foreign value — start the demo over rather than crash.
    }
  }

  const fresh = initialState(box);
  saveState(fresh, box);
  return fresh;
}

export function saveState(state: DemoState, box: DemoMailboxId = DEFAULT_BOX): void {
  memoryState.set(box, state);
  const store = storage();
  if (!store) return;
  try {
    store.setItem(storageKey(box), JSON.stringify(state));
  } catch {
    // Quota or a blocked write; the in-memory copy is still correct.
  }
}

export function mutate(
  change: (state: DemoState) => void,
  box: DemoMailboxId = DEFAULT_BOX,
): DemoState {
  const state = loadState(box);
  change(state);
  saveState(state, box);
  return state;
}

/** Throws the demo — both sample mailboxes — back to its starting point. */
export function clearState(): void {
  memoryState.clear();
  const store = storage();
  for (const mailbox of DEMO_MAILBOXES) {
    try {
      store?.removeItem(storageKey(mailbox.id));
    } catch {
      // Nothing to clear.
    }
  }
}

// --- Scanning ---------------------------------------------------------------

export function startDemoScan(lookbackDays: number, box: DemoMailboxId = DEFAULT_BOX): DemoScan {
  const scan: DemoScan = {
    scanId: `demo-scan-${Date.now()}`,
    status: SCAN_STATUS.RUNNING,
    lookbackDays,
    processedMessages: 0,
    matchedMessages: 0,
    totalEstimate: Math.max(
      SCAN_STEP_MESSAGES * 3,
      Math.round(SEEDS[box].scanTotal * Math.min(4, lookbackDays / DEMO_DEFAULT_LOOKBACK_DAYS)),
    ),
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  mutate((state) => {
    state.scan = scan;
  }, box);
  return scan;
}

/**
 * Advances a running scan by one step.
 *
 * On the final step, a scan that looked further back than the default window
 * turns up the senders held in reserve — so changing the lookback has a visible
 * consequence rather than being a decorative control.
 */
export function stepDemoScan(box: DemoMailboxId = DEFAULT_BOX): DemoScan {
  const state = loadState(box);
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
      for (const seed of SEEDS[box].senders) {
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
    state.lastDone = { ...scan };
  }

  saveState(state, box);
  return scan;
}
