/**
 * Clear out's filters, as data.
 *
 * Pure and not server-only: the page keeps them in the URL, the API turns them
 * into a Gmail search, the demo matches sample messages against them, and the
 * tests pin all three down without a browser or a mailbox.
 *
 * Three shapes, one per boundary:
 *
 *   ClearOutFilter   what the person chose, as it lives in the URL
 *                    (?from=…&older=6m&unread=1)
 *   ClearOutQuery    what crosses the wire: the same choices with the
 *                    "older than" cutoff resolved to an instant in the
 *                    person's own timezone, so server and browser agree
 *   gmailSearch()    the Gmail `q` string and label ids built from a query
 *
 * Filters of different kinds combine with AND. Several senders combine with
 * OR among themselves. Applying a filter never changes mail.
 */

export type OlderPreset = "3m" | "6m" | "1y";

export const OLDER_PRESETS: { value: OlderPreset; label: string; months: number }[] = [
  { value: "3m", label: "3 months", months: 3 },
  { value: "6m", label: "6 months", months: 6 },
  { value: "1y", label: "1 year", months: 12 },
];

/** Size options for the expanded Filters panel, in megabytes. */
export const SIZE_OPTIONS = [5, 10, 25] as const;
export type SizeOption = (typeof SIZE_OPTIONS)[number];

export type ClearOutScope =
  | { kind: "all" }
  | { kind: "inbox" }
  | { kind: "label"; id: string };

export type ClearOutFilter = {
  /** Exact sending addresses, lowercase. Any of them matches. */
  senders: string[];
  /** A preset ("6m") or a custom cutoff date ("2026-01-15"). */
  older: string | null;
  unread: boolean;
  attachments: boolean;
  /** Larger than this many megabytes. */
  larger: SizeOption | null;
  /** Only mail from lists you confirmed an unsubscribe from. */
  unsubscribed: boolean;
  scope: ClearOutScope;
  search: string;
};

export const EMPTY_FILTER: ClearOutFilter = {
  senders: [],
  older: null,
  unread: false,
  attachments: false,
  larger: null,
  unsubscribed: false,
  scope: { kind: "all" },
  search: "",
};

/** Caps that keep a URL, and the Gmail query built from it, a sane size. */
export const MAX_SENDERS = 20;
export const MAX_SEARCH_LENGTH = 200;

const EMAIL = /^[^\s@<>(){}"',;:\\]+@[^\s@<>(){}"',;:\\.]+(\.[^\s@<>(){}"',;:\\.]+)+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Gmail label ids: system names (INBOX) or "Label_123". */
const LABEL_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isSenderAddress(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value);
}

export function isLabelId(value: string): boolean {
  return LABEL_ID.test(value);
}

/** A custom cutoff "YYYY-MM-DD" that names a real calendar day. */
export function isCutoffDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isOlder(value: string): boolean {
  return OLDER_PRESETS.some((preset) => preset.value === value) || isCutoffDate(value);
}

// --- The URL ------------------------------------------------------------------

/** Reads the filter from the page's search params, dropping anything malformed. */
export function parseFilter(params: URLSearchParams): ClearOutFilter {
  const senders = [
    ...new Set(
      params
        .getAll("from")
        .map((value) => value.trim().toLowerCase())
        .filter(isSenderAddress),
    ),
  ].slice(0, MAX_SENDERS);

  const older = params.get("older");
  const larger = Number(params.get("larger"));
  const label = params.get("label");
  const scope: ClearOutScope =
    label && isLabelId(label)
      ? { kind: "label", id: label }
      : params.get("scope") === "inbox"
        ? { kind: "inbox" }
        : { kind: "all" };

  return {
    senders,
    older: older && isOlder(older) ? older : null,
    unread: params.get("unread") === "1",
    attachments: params.get("attachments") === "1",
    larger: (SIZE_OPTIONS as readonly number[]).includes(larger) ? (larger as SizeOption) : null,
    unsubscribed: params.get("unsubscribed") === "1",
    scope,
    search: (params.get("q") ?? "").slice(0, MAX_SEARCH_LENGTH),
  };
}

/** The filter as search params, in a stable order and without defaults. */
export function filterParams(filter: ClearOutFilter): URLSearchParams {
  const params = new URLSearchParams();
  for (const sender of filter.senders) params.append("from", sender);
  if (filter.older) params.set("older", filter.older);
  if (filter.unread) params.set("unread", "1");
  if (filter.attachments) params.set("attachments", "1");
  if (filter.larger) params.set("larger", String(filter.larger));
  if (filter.unsubscribed) params.set("unsubscribed", "1");
  if (filter.scope.kind === "inbox") params.set("scope", "inbox");
  if (filter.scope.kind === "label") params.set("label", filter.scope.id);
  if (filter.search.trim()) params.set("q", filter.search.trim());
  return params;
}

export function clearOutHref(basePath: string, filter: ClearOutFilter = EMPTY_FILTER): string {
  const query = filterParams(filter).toString();
  return `${basePath}/clear-out${query ? `?${query}` : ""}`;
}

/** Identifies a result set. A selection made under one key never carries to another. */
export function filterKey(filter: ClearOutFilter): string {
  return filterParams({ ...filter, search: filter.search.trim() }).toString();
}

/** True when any filter narrows the list (the scope and search are not filters). */
export function hasFilters(filter: ClearOutFilter): boolean {
  return (
    filter.senders.length > 0 ||
    filter.older !== null ||
    filter.unread ||
    filter.attachments ||
    filter.larger !== null ||
    filter.unsubscribed
  );
}

/** Removes every filter, keeping the mailbox scope and the search. */
export function clearFilters(filter: ClearOutFilter): ClearOutFilter {
  return { ...EMPTY_FILTER, scope: filter.scope, search: filter.search };
}

// --- Dates ----------------------------------------------------------------------

/**
 * When "older than" starts, as a local instant.
 *
 * Always midnight at the start of a calendar day in the person's own
 * timezone: "older than 6 months" on 2 October means received before
 * 00:00 on 2 April, wherever they are. Months are calendar months, and a day
 * the shorter month lacks clamps to that month's last day (31 Aug − 6 months
 * is 28 or 29 Feb, never 3 March).
 */
export function cutoffFor(older: string | null, now: Date = new Date()): Date | null {
  if (!older) return null;

  const preset = OLDER_PRESETS.find((option) => option.value === older);
  if (preset) {
    const target = new Date(now.getFullYear(), now.getMonth() - preset.months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(now.getDate(), lastDay));
  }

  if (isCutoffDate(older)) {
    const [y, m, d] = older.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  return null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2 April 2026" — written out, so it cannot be misread as day/month or month/day. */
export function longDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "2 Apr 2026", for a chip. */
export function shortDate(date: Date): string {
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "YYYY-MM-DD" for a local date, as an <input type="date"> wants it. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The label on the quick filter and its chip. */
export function olderLabel(older: string | null, now: Date = new Date()): string | null {
  const cutoff = cutoffFor(older, now);
  if (!cutoff) return null;
  const preset = OLDER_PRESETS.find((option) => option.value === older);
  return preset ? `Older than ${preset.label}` : `Before ${shortDate(cutoff)}`;
}

/** The sentence under the choices: what the cutoff means, in ordinary words. */
export function describeCutoff(older: string | null, now: Date = new Date()): string | null {
  const cutoff = cutoffFor(older, now);
  if (!cutoff) return null;
  return `Emails received before ${longDate(cutoff)}, counted from midnight at the start of that day in your timezone.`;
}

// --- The wire -----------------------------------------------------------------

/** What the API receives. `before` is epoch milliseconds, already resolved. */
export type ClearOutQuery = {
  from: string[];
  before: number | null;
  unread: boolean;
  attachments: boolean;
  larger: SizeOption | null;
  unsubscribed: boolean;
  scope: "all" | "inbox" | "label";
  label: string | null;
  search: string;
};

export function toQuery(filter: ClearOutFilter, now: Date = new Date()): ClearOutQuery {
  return {
    from: filter.senders,
    before: cutoffFor(filter.older, now)?.getTime() ?? null,
    unread: filter.unread,
    attachments: filter.attachments,
    larger: filter.larger,
    unsubscribed: filter.unsubscribed,
    scope: filter.scope.kind,
    label: filter.scope.kind === "label" ? filter.scope.id : null,
    search: filter.search.trim(),
  };
}

/** A query as GET parameters. */
export function queryParams(query: ClearOutQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const sender of query.from) params.append("from", sender);
  if (query.before !== null) params.set("before", String(query.before));
  if (query.unread) params.set("unread", "1");
  if (query.attachments) params.set("attachments", "1");
  if (query.larger) params.set("larger", String(query.larger));
  if (query.unsubscribed) params.set("unsubscribed", "1");
  params.set("scope", query.scope);
  if (query.label) params.set("label", query.label);
  if (query.search) params.set("search", query.search);
  return params;
}

/**
 * Validates a query from GET parameters or a JSON body. Throws on anything
 * malformed rather than quietly widening the search: a bulk action must run
 * against exactly what was asked for.
 */
export function readQuery(input: URLSearchParams | Record<string, unknown>): ClearOutQuery {
  const get = (key: string): unknown =>
    input instanceof URLSearchParams ? input.get(key) : (input as Record<string, unknown>)[key];
  const flag = (key: string) => {
    const value = get(key);
    return value === true || value === "1" || value === "true";
  };

  const rawFrom =
    input instanceof URLSearchParams ? input.getAll("from") : (get("from") ?? []);
  if (!Array.isArray(rawFrom) || rawFrom.length > MAX_SENDERS) throw new QueryError("from");
  const from = rawFrom.map((value) => String(value).trim().toLowerCase());
  if (!from.every(isSenderAddress)) throw new QueryError("from");

  const rawBefore = get("before");
  let before: number | null = null;
  if (rawBefore !== null && rawBefore !== undefined && rawBefore !== "") {
    before = Number(rawBefore);
    // Between 1990 and a day from now: anything else is not a cutoff.
    if (!Number.isInteger(before) || before < 631_152_000_000 || before > Date.now() + 86_400_000) {
      throw new QueryError("before");
    }
  }

  const rawLarger = get("larger");
  let larger: SizeOption | null = null;
  if (rawLarger !== null && rawLarger !== undefined && rawLarger !== "") {
    const n = Number(rawLarger);
    if (!(SIZE_OPTIONS as readonly number[]).includes(n)) throw new QueryError("larger");
    larger = n as SizeOption;
  }

  const scope = get("scope") ?? "all";
  if (scope !== "all" && scope !== "inbox" && scope !== "label") throw new QueryError("scope");
  const label = get("label");
  if (scope === "label" && (typeof label !== "string" || !isLabelId(label))) {
    throw new QueryError("label");
  }

  const search = String(get("search") ?? "").trim();
  if (search.length > MAX_SEARCH_LENGTH) throw new QueryError("search");

  return {
    from: [...new Set(from)],
    before,
    unread: flag("unread"),
    attachments: flag("attachments"),
    larger,
    unsubscribed: flag("unsubscribed"),
    scope,
    label: scope === "label" ? (label as string) : null,
    search,
  };
}

export class QueryError extends Error {
  constructor(readonly field: string) {
    super(`Invalid filter: ${field}`);
    this.name = "QueryError";
  }
}

// --- Gmail ----------------------------------------------------------------------

/** One unsubscribed list: its exact address and the List-Ids it used. */
export type UnsubscribedList = { address: string; listIds: string[] };

/** How many unsubscribed lists one Gmail query will name. */
export const MAX_UNSUBSCRIBED_CLAUSES = 60;

const LIST_ID = /^[a-z0-9._-]{1,200}$/;

/** Words of a free-text search, quoted so none of them is read as an operator. */
export function searchTerms(search: string): string[] {
  return search
    .split(/\s+/)
    .map((term) => term.replace(/["\\{}()]/g, "").replace(/^[-+]+/, ""))
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * The Gmail search for a query.
 *
 * Returns null when the query cannot match anything — "From unsubscribed"
 * with no confirmed unsubscribes — so the caller can answer "none" without
 * asking Gmail.
 *
 * Scope: All mail is everything except Trash and Spam (messages.list leaves
 * those out unless includeSpamTrash is set) and except drafts and chats,
 * which are excluded here. Sent mail is included, as Gmail's All Mail
 * includes it. Inbox and a label narrow by label id.
 *
 * The cutoff is sent as epoch seconds: Gmail reads a written date
 * (before:2026/04/02) as midnight Pacific time, which is the wrong midnight
 * for almost everyone else.
 */
export function gmailSearch(
  query: ClearOutQuery,
  unsubscribed: UnsubscribedList[] = [],
): { q: string; labelIds: string[]; truncatedLists: boolean } | null {
  const parts = ["-in:drafts", "-in:chats"];

  if (query.from.length === 1) parts.push(`from:${query.from[0]}`);
  if (query.from.length > 1) parts.push(`{${query.from.map((a) => `from:${a}`).join(" ")}}`);
  if (query.before !== null) parts.push(`before:${Math.floor(query.before / 1000)}`);
  if (query.unread) parts.push("is:unread");
  if (query.attachments) parts.push("has:attachment");
  if (query.larger) parts.push(`larger:${query.larger}M`);

  let truncatedLists = false;
  if (query.unsubscribed) {
    const clauses = unsubscribed
      .filter((list) => isSenderAddress(list.address))
      .map((list) => {
        const ids = list.listIds.filter((id) => LIST_ID.test(id));
        if (ids.length === 0) return `from:${list.address}`;
        const lists = ids.length === 1 ? `list:${ids[0]}` : `{${ids.map((id) => `list:${id}`).join(" ")}}`;
        return `(from:${list.address} ${lists})`;
      });
    if (clauses.length === 0) return null;
    truncatedLists = clauses.length > MAX_UNSUBSCRIBED_CLAUSES;
    const used = clauses.slice(0, MAX_UNSUBSCRIBED_CLAUSES);
    parts.push(used.length === 1 ? used[0] : `{${used.join(" ")}}`);
  }

  for (const term of searchTerms(query.search)) parts.push(`"${term}"`);

  const labelIds =
    query.scope === "inbox" ? ["INBOX"] : query.scope === "label" && query.label ? [query.label] : [];

  return { q: parts.join(" "), labelIds, truncatedLists };
}

// --- Matching a message directly (the demo) -------------------------------------

export type MatchableMessage = {
  fromAddress: string;
  fromName: string | null;
  to: string | null;
  subject: string | null;
  snippet: string;
  receivedAt: number;
  unread: boolean;
  hasAttachment: boolean;
  sizeBytes: number;
  labelIds: string[];
  listId: string | null;
  draft?: boolean;
};

/**
 * Whether one message matches a query — the same rules as gmailSearch(),
 * applied in memory. Trash and Spam are outside every scope.
 */
export function matchesQuery(
  message: MatchableMessage,
  query: ClearOutQuery,
  unsubscribed: UnsubscribedList[] = [],
): boolean {
  if (message.draft) return false;
  if (message.labelIds.includes("TRASH") || message.labelIds.includes("SPAM")) return false;
  if (query.scope === "inbox" && !message.labelIds.includes("INBOX")) return false;
  if (query.scope === "label" && (!query.label || !message.labelIds.includes(query.label))) return false;

  if (query.from.length && !query.from.includes(message.fromAddress.toLowerCase())) return false;
  if (query.before !== null && !(message.receivedAt < query.before)) return false;
  if (query.unread && !message.unread) return false;
  if (query.attachments && !message.hasAttachment) return false;
  if (query.larger && !(message.sizeBytes > query.larger * 1024 * 1024)) return false;

  if (query.unsubscribed) {
    const listed = unsubscribed.some((list) => {
      if (list.address !== message.fromAddress.toLowerCase()) return false;
      if (list.listIds.length === 0) return true;
      return message.listId !== null && list.listIds.includes(message.listId);
    });
    if (!listed) return false;
  }

  const terms = searchTerms(query.search).map((term) => term.toLowerCase());
  if (terms.length) {
    const haystack = [message.fromAddress, message.fromName, message.to, message.subject, message.snippet]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!terms.every((term) => haystack.includes(term))) return false;
  }

  return true;
}
