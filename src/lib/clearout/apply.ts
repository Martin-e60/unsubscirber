import type { MailOrganiser } from "@/lib/mail/provider";
import { labelChange, type ClearOutAction } from "./actions";

/**
 * Applies one batch of an action to exactly the given message ids.
 *
 * Label changes go to Gmail as one batchModify. That call is all or nothing,
 * so when it fails for a reason other than permission the batch is retried
 * one message at a time — the honest way to say which ones worked. A
 * permission failure is rethrown untouched: nothing was changed, and the
 * person needs to grant access, not retry.
 */
export async function applyBatch(
  organiser: MailOrganiser,
  run: { action: ClearOutAction; labelId: string | null },
  ids: string[],
  isPermissionError: (error: unknown) => boolean = defaultIsPermission,
): Promise<{ succeeded: string[]; failed: string[] }> {
  if (run.action === "trash") return organiser.trashMessages(ids);

  const { add, remove } = labelChange(run.action, run.labelId);

  try {
    await organiser.modifyLabels(ids, add, remove);
    return { succeeded: ids, failed: [] };
  } catch (error) {
    if (isPermissionError(error)) throw error;
  }

  const succeeded: string[] = [];
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await organiser.modifyLabels([id], add, remove);
      succeeded.push(id);
    } catch (error) {
      if (isPermissionError(error)) throw error;
      failed.push(id);
    }
  }
  return { succeeded, failed };
}

function defaultIsPermission(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { isPermission?: boolean }).isPermission);
}
