import { ApiRequestError, type ApiClient, type RequestOptions } from "./client";
import { MAILBOX_NOT_FOUND } from "@/lib/mailbox/shared";

/** Error code for a request whose mailbox was switched away from in this tab. */
export const MAILBOX_SWITCHED = "mailbox_switched";

/**
 * A client bound to one mailbox.
 *
 * Every request it makes names that mailbox, so the server acts on it and on
 * nothing else — whatever another tab, or this tab a moment later, has
 * selected. When the tab switches mailbox, `signal` is aborted: requests in
 * flight are cancelled, their answers are never handed to the screen, and
 * anything a loop tries to send afterwards (the next scan step, the next
 * batch of an unsubscribe) is refused before it leaves the browser.
 *
 * A mailbox that has been removed — in another tab, say — is reported once
 * through `onMailboxGone`, so the tab can move to one that is still there.
 */
export function createMailboxClient(
  base: ApiClient,
  mailboxId: string | null,
  options: { signal: AbortSignal; onMailboxGone?: () => void },
): ApiClient {
  const { signal, onMailboxGone } = options;

  const switched = () =>
    new ApiRequestError("You switched to another mailbox, so this was stopped.", 0, MAILBOX_SWITCHED);

  async function scoped<T>(send: (options: RequestOptions) => Promise<T>): Promise<T> {
    if (signal.aborted) throw switched();
    try {
      const result = await send({ mailboxId, signal });
      // Answered, but for a mailbox this tab has since left: drop it.
      if (signal.aborted) throw switched();
      return result;
    } catch (error) {
      if (signal.aborted) throw switched();
      if (error instanceof ApiRequestError && error.code === MAILBOX_NOT_FOUND) onMailboxGone?.();
      throw error;
    }
  }

  return {
    get: <T>(path: string) => scoped<T>((o) => base.get<T>(path, o)),
    post: <T>(path: string, json?: unknown) => scoped<T>((o) => base.post<T>(path, json, o)),
    patch: <T>(path: string, json?: unknown) => scoped<T>((o) => base.patch<T>(path, json, o)),
    del: <T>(path: string) => scoped<T>((o) => base.del<T>(path, o)),
  };
}
