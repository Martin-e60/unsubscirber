/**
 * The mailbox interface.
 *
 * Everything above this file — the scan engine, the unsubscribe engine, the
 * API routes, the entire UI — talks only to `MailProvider`. Nothing outside
 * src/lib/mail/gmail.ts knows Gmail exists.
 *
 * Adding Outlook later means writing one new file that implements this
 * interface and one line in `getProviderForAccount()`. No other code changes.
 */

/** The headers we care about, pulled from one message. */
export type MessageHeaders = {
  id: string;
  from: string | null;
  subject: string | null;
  date: Date | null;
  listUnsubscribe: string | null;
  listUnsubscribePost: string | null;
  listId: string | null;
  precedence: string | null;
};

/** One page of results plus the cursor needed to ask for the next one. */
export type MessagePage = {
  messages: MessageHeaders[];
  /** Null when the mailbox has no more pages. */
  nextPageToken: string | null;
  /** Provider's rough total, used only to size the progress bar. */
  totalEstimate: number;
};

export type ListOptions = {
  lookbackDays: number;
  pageToken?: string | null;
  pageSize: number;
};

export type SendMailOptions = {
  to: string;
  subject: string;
  body: string;
};

export interface MailProvider {
  /** Machine name, matching mailAccounts.provider. */
  readonly name: string;

  /** The address of the connected mailbox. */
  readonly address: string;

  /**
   * Fetches one page of messages that could plausibly be subscriptions,
   * already reduced to the headers we need.
   */
  listSubscriptionMessages(options: ListOptions): Promise<MessagePage>;

  /**
   * Returns the HTML body of one message, for the case where a sender
   * publishes no List-Unsubscribe header and we have to scrape a link.
   */
  getMessageHtml(messageId: string): Promise<string | null>;

  /**
   * Sends an email as the connected user. Used for `mailto:` unsubscribes,
   * which are only honoured when they come from the subscribed address.
   */
  sendMail(options: SendMailOptions): Promise<void>;
}

/**
 * True when a message looks like bulk/subscription mail rather than a personal
 * email. A List-Unsubscribe header is the strongest signal; List-Id and
 * Precedence catch mailing lists that predate it.
 */
export function looksLikeSubscription(message: MessageHeaders): boolean {
  if (message.listUnsubscribe) return true;
  if (message.listId) return true;
  const precedence = (message.precedence ?? "").toLowerCase();
  return precedence === "bulk" || precedence === "list";
}

// --- Organising mail (Clear out) -----------------------------------------------

/** What Clear out reads about one message: metadata and the provider's snippet. */
export type MessageMetadata = {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  sizeEstimate: number | null;
  date: Date | null;
  /** Requested headers, keyed by lowercase name. */
  headers: Record<string, string>;
};

export type MailLabel = { id: string; name: string; type: "user" | "system" };

export type SearchOptions = {
  q: string;
  labelIds: string[];
  pageToken?: string | null;
  maxResults: number;
};

/**
 * Finding and organising individual messages.
 *
 * Kept apart from MailProvider because it needs a further permission: search
 * and metadata work with read access, but every method that changes labels
 * or moves mail to the bin needs modify access, which a mailbox may not have
 * granted yet.
 */
export interface MailOrganiser {
  searchMessages(options: SearchOptions): Promise<{
    ids: string[];
    nextPageToken: string | null;
    estimate: number;
  }>;
  /** Null in a slot whose message could not be read. Same order as `ids`. */
  getMetadata(ids: string[], headers: string[]): Promise<(MessageMetadata | null)[]>;
  listLabels(): Promise<MailLabel[]>;
  /** Changes labels on exactly these messages, never their whole threads. */
  modifyLabels(ids: string[], add: string[], remove: string[]): Promise<void>;
  /** Moves each message to the bin. Reports which ones made it. */
  trashMessages(ids: string[]): Promise<{ succeeded: string[]; failed: string[] }>;
}
