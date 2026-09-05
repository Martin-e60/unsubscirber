/**
 * Deciding whether an unsubscribe page actually worked.
 *
 * Pure string logic, kept out of the engine so it can be tested directly
 * without a network or a database.
 */

/**
 * Looks for wording that means the unsubscribe actually completed.
 *
 * Deliberately strict: a page merely containing the word "unsubscribe" is
 * usually a form asking you to confirm, not a confirmation.
 */
export function pageConfirmsUnsubscribe(html: string): boolean {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const confirmations = [
    /you (have been|were|are now) (successfully )?unsubscribed/,
    /successfully unsubscribed/,
    /unsubscribe (was )?successful/,
    /you (have been|were) removed from/,
    /(you )?will no longer receive/,
    /your (email|address) has been removed/,
    /subscription (has been )?cancell?ed/,
    /you'?re unsubscribed/,
  ];

  if (!confirmations.some((pattern) => pattern.test(text))) return false;

  // A page that also asks you to confirm is not a confirmation.
  const stillAsking = [
    /click (here |the button )?to (confirm|unsubscribe)/,
    /please confirm/,
    /are you sure/,
  ];
  return !stillAsking.some((pattern) => pattern.test(text));
}
