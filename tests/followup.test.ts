import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookbackToCover,
  normaliseListId,
  observe,
  type CompletedCheck,
  type RecordedMessage,
} from "../src/lib/followup/match";
import { gmailMessageUrl } from "../src/lib/followup/archive";

/**
 * The rules behind the Unsubscribed page's "No new mail", "2 new emails" and
 * "Not checked yet". Pure, so every edge is pinned without a database.
 */

const DAY = 86_400_000;
const now = new Date("2026-09-29T10:42:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
const unsubscribedAt = daysAgo(7);

const check = (startedDaysAgo: number, lookbackDays = 30): CompletedCheck => ({
  startedAt: daysAgo(startedDaysAgo),
  finishedAt: new Date(daysAgo(startedDaysAgo).getTime() + 60_000),
  lookbackDays,
});

const message = (id: string, receivedDaysAgo: number | null, listId: string | null = null): RecordedMessage => ({
  id,
  receivedAt: receivedDaysAgo === null ? null : daysAgo(receivedDaysAgo),
  listId,
  subject: `Subject ${id}`,
});

test("mail received after the unsubscribe is new mail, newest first", () => {
  const result = observe({
    unsubscribedAt,
    earlierListIds: [],
    messages: [message("old", 10), message("a", 5), message("b", 2)],
    latestCheck: check(0),
  });
  assert.equal(result.state, "NEW_MAIL");
  assert.deepEqual(result.messages.map((m) => m.id), ["b", "a"]);
  assert.equal(result.check?.found, 2);
});

test("a message at the exact moment of the unsubscribe, or without a date, is not counted", () => {
  const exact: RecordedMessage = { id: "x", receivedAt: new Date(unsubscribedAt), listId: null, subject: null };
  const result = observe({
    unsubscribedAt,
    earlierListIds: [],
    messages: [exact, message("undated", null)],
    latestCheck: check(0),
  });
  assert.equal(result.state, "NO_NEW_MAIL");
  assert.equal(result.messages.length, 0);
});

test("the same message seen by two scans counts once", () => {
  const result = observe({
    unsubscribedAt,
    earlierListIds: [],
    messages: [message("a", 3), message("a", 3), message("b", 2)],
    latestCheck: check(0),
  });
  assert.equal(result.messages.length, 2);
});

test("with a known List-Id, only that list counts — not other lists or receipts from the address", () => {
  const result = observe({
    unsubscribedAt,
    earlierListIds: ["Weekly News <weekly.example.com>"],
    messages: [
      message("same-list", 3, "<weekly.example.com>"),
      message("other-list", 3, "Offers <offers.example.com>"),
      message("no-list-id", 2, null),
    ],
    latestCheck: check(0),
  });
  assert.equal(result.matchedBy, "LIST_ID");
  assert.deepEqual(result.messages.map((m) => m.id), ["same-list"]);
});

test("a finished check with nothing matching is no new mail, with the range it covered", () => {
  const result = observe({ unsubscribedAt, earlierListIds: [], messages: [], latestCheck: check(0) });
  assert.equal(result.state, "NO_NEW_MAIL");
  assert.equal(result.check?.partial, false);
  assert.equal(result.check?.from.getTime(), unsubscribedAt.getTime());
});

test("a check that did not reach back to the unsubscribe is reported as partial", () => {
  const result = observe({
    unsubscribedAt: daysAgo(90),
    earlierListIds: [],
    messages: [],
    latestCheck: check(0, 30),
  });
  assert.equal(result.state, "NO_NEW_MAIL");
  assert.equal(result.check?.partial, true);
  assert.equal(result.check?.from.getTime(), daysAgo(30).getTime());
});

test("no completed check since the unsubscribe is not checked yet", () => {
  // A failed or stopped scan never becomes a CompletedCheck, so it is the
  // same as having no check at all.
  assert.equal(
    observe({ unsubscribedAt, earlierListIds: [], messages: [], latestCheck: null }).reason,
    "NO_CHECK",
  );
  assert.equal(
    observe({ unsubscribedAt, earlierListIds: [], messages: [], latestCheck: check(8) }).reason,
    "NO_CHECK",
    "a check from before the unsubscribe says nothing about after it",
  );
});

test("a check within a day of unsubscribing is too soon to call it quiet", () => {
  const result = observe({
    unsubscribedAt: new Date(now.getTime() - 2 * 3_600_000),
    earlierListIds: [],
    messages: [],
    latestCheck: check(0),
  });
  assert.equal(result.state, "NOT_CHECKED");
  assert.equal(result.reason, "TOO_SOON");
});

test("an unsubscribe without a recorded date is never given invented history", () => {
  const result = observe({
    unsubscribedAt: null,
    earlierListIds: [],
    messages: [message("a", 1)],
    latestCheck: check(0),
  });
  assert.equal(result.state, "NOT_CHECKED");
  assert.equal(result.reason, "NO_DATE");
  assert.equal(result.messages.length, 0);
});

test("list ids normalise to the bracketed identifier", () => {
  assert.equal(normaliseListId("Figma News <News.Figma.com>"), "news.figma.com");
  assert.equal(normaliseListId(" plain.list.example "), "plain.list.example");
  assert.equal(normaliseListId(null), null);
});

test("check again reaches back to the oldest unsubscribe, within the offered periods", () => {
  const options = [30, 90, 180, 365, 1095];
  assert.equal(lookbackToCover(daysAgo(7), options, 30, now), 30);
  assert.equal(lookbackToCover(daysAgo(45), options, 30, now), 90);
  assert.equal(lookbackToCover(daysAgo(4000), options, 30, now), 1095);
  assert.equal(lookbackToCover(null, options, 30, now), 30);
});

test("gmail links are built only for gmail and plausible message ids", () => {
  assert.equal(
    gmailMessageUrl("gmail", "sam@example.com", "18c2f0a9b1"),
    "https://mail.google.com/mail/?authuser=sam%40example.com#all/18c2f0a9b1",
  );
  assert.equal(gmailMessageUrl("outlook", "sam@example.com", "18c2f0a9b1"), null);
  assert.equal(gmailMessageUrl("gmail", "sam@example.com", "demo-1"), null, "not a Gmail message id");
});
