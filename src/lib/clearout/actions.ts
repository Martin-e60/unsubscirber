/**
 * What Clear out can do to selected emails, and how each action is described.
 *
 * Pure, shared by the API, the demo and the page, so the label change Gmail
 * receives and the sentence the person reads come from one table.
 *
 * Every action works on individual message ids. None of them touches the
 * other messages in a conversation, none deletes permanently, and none
 * changes a sender's Keeping or unsubscribe status in Cleanup.
 */

export const CLEAR_OUT_ACTIONS = ["mark_read", "label", "archive", "trash"] as const;
export type ClearOutAction = (typeof CLEAR_OUT_ACTIONS)[number];

export function isClearOutAction(value: unknown): value is ClearOutAction {
  return (CLEAR_OUT_ACTIONS as readonly unknown[]).includes(value);
}

/**
 * The label change behind each action. Trash is not a label change: Gmail's
 * own messages.trash is used, which is what the Gmail interface does.
 */
export function labelChange(
  action: Exclude<ClearOutAction, "trash">,
  labelId: string | null = null,
): { add: string[]; remove: string[] } {
  switch (action) {
    case "mark_read":
      return { add: [], remove: ["UNREAD"] };
    case "archive":
      return { add: [], remove: ["INBOX"] };
    case "label":
      if (!labelId) throw new Error("A label is required.");
      // Adds one label. Every other label on the message stays as it was.
      return { add: [labelId], remove: [] };
  }
}

/** Largest batch one request to our API may carry. */
export const CHUNK_SIZE: Record<ClearOutAction, number> = {
  // Gmail's batchModify takes up to 1,000 ids; half that keeps each request quick.
  mark_read: 500,
  label: 500,
  archive: 500,
  // Trash is one Gmail call per message, so smaller batches keep requests short.
  trash: 50,
};

/** The most emails "Select all matching" will gather for one action. */
export const MAX_SELECTION = 5_000;

export function emails(count: number): string {
  return `${count.toLocaleString("en")} ${count === 1 ? "email" : "emails"}`;
}

/** "12 emails archived." — what happened, plainly. */
export function successSentence(action: ClearOutAction, count: number, labelName?: string | null): string {
  switch (action) {
    case "mark_read":
      return `${emails(count)} marked as read.`;
    case "label":
      return `Label “${labelName ?? "label"}” added to ${emails(count)}.`;
    case "archive":
      return `${emails(count)} archived.`;
    case "trash":
      return `${emails(count)} moved to Trash.`;
  }
}

/** "2 emails couldn’t be archived." */
export function failureSentence(action: ClearOutAction, count: number): string {
  const verb = {
    mark_read: "marked as read",
    label: "labelled",
    archive: "archived",
    trash: "moved to Trash",
  }[action];
  return `${emails(count)} couldn’t be ${verb}.`;
}

/** The History line's title. */
export function historyTitle(action: ClearOutAction, labelName?: string | null): string {
  switch (action) {
    case "mark_read":
      return "Marked as read";
    case "label":
      return labelName ? `Labelled “${labelName}”` : "Labelled";
    case "archive":
      return "Archived";
    case "trash":
      return "Moved to Trash";
  }
}

/** Gmail message ids are hexadecimal; the demo's are short slugs. */
export function isMessageId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
