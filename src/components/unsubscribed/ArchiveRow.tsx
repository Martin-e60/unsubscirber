"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  CircleCheck,
  Clock,
  ExternalLink,
  Info,
  Mail,
} from "lucide-react";
import { toInitials } from "@/components/ui/Avatar";
import type { ArchiveItemDto } from "@/lib/api/types";
import { monthDay, plural } from "./format";
import styles from "./ArchiveRow.module.css";

/**
 * One confirmed unsubscribe, and what has been seen from that list since.
 *
 * The row is a single disclosure button; its details open inline beneath it.
 * What the details say is an observation from the last check, never a new
 * verdict on the unsubscribe: a list that writes again is still a confirmed
 * unsubscribe, just one worth a second look.
 */

export function ArchiveRow({
  item,
  open,
  demo,
  basePath,
  onToggle,
}: {
  item: ArchiveItemDto;
  open: boolean;
  demo: boolean;
  basePath: string;
  onToggle: (button: HTMLButtonElement) => void;
}) {
  const label = item.name ?? item.address;
  const panelId = `archive-details-${item.senderId}`;
  const buttonId = `archive-row-${item.senderId}`;

  return (
    <li className={styles.row} data-open={open || undefined}>
      <h3 className={styles.heading}>
        <button
          type="button"
          id={buttonId}
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={(event) => onToggle(event.currentTarget)}
        >
          <span className={styles.avatar} aria-hidden="true">
            {toInitials(label)}
          </span>
          <span className={styles.identity}>
            <span className={styles.name}>{label}</span>
            <span className={styles.date}>
              {item.unsubscribedAt
                ? `Unsubscribed ${monthDay(item.unsubscribedAt)}`
                : "Unsubscribe date not recorded"}
            </span>
          </span>
          <Status item={item} />
          <ChevronRight className={styles.chevron} size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </h3>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={styles.panel}
        hidden={!open}
      >
        {open ? <Details item={item} demo={demo} basePath={basePath} /> : null}
      </div>
    </li>
  );
}

function Status({ item }: { item: ArchiveItemDto }) {
  if (item.observation === "NEW_MAIL") {
    return (
      <span className={styles.status} data-state="new" key="new">
        <Mail size={18} strokeWidth={1.75} aria-hidden />
        {plural(item.newCount, "new email", "new emails")}
      </span>
    );
  }
  if (item.observation === "NO_NEW_MAIL") {
    return (
      <span className={styles.status} data-state="quiet" key="quiet">
        <CircleCheck size={20} strokeWidth={1.6} aria-hidden />
        No new mail
      </span>
    );
  }
  return (
    <span className={styles.status} data-state="unchecked" key="unchecked">
      <Clock size={20} strokeWidth={1.6} aria-hidden />
      Not checked yet
    </span>
  );
}

function Details({ item, demo, basePath }: { item: ArchiveItemDto; demo: boolean; basePath: string }) {
  const since = item.unsubscribedAt ? monthDay(item.unsubscribedAt) : null;
  const shown = item.newMessages.length;

  return (
    <div className={styles.details}>
      {item.observation === "NEW_MAIL" ? (
        <>
          <h4 className={styles.detailsTitle}>Received after you unsubscribed</h4>
          <ul className={styles.messages}>
            {item.newMessages.map((message) => (
              <li key={message.id} className={styles.message}>
                <Mail className={styles.messageIcon} size={20} strokeWidth={1.6} aria-hidden />
                <span className={styles.subject} data-missing={!message.subject || undefined}>
                  {message.subject ?? "No subject recorded"}
                </span>
                <span className={styles.received}>{monthDay(message.receivedAt)}</span>
                {message.gmailUrl ? (
                  <a
                    className={styles.open}
                    href={message.gmailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open “${message.subject ?? "this message"}” in Gmail (opens in a new tab)`}
                  >
                    <ExternalLink size={17} strokeWidth={1.75} aria-hidden />
                    Open in Gmail
                  </a>
                ) : demo ? (
                  <span className={styles.sample}>Sample message</span>
                ) : null}
              </li>
            ))}
          </ul>
          {item.newCount > shown ? (
            <p className={styles.more}>
              and {plural(item.newCount - shown, "earlier email", "earlier emails")} not listed
            </p>
          ) : null}
          <hr className={styles.rule} />
        </>
      ) : null}

      <ul className={styles.history}>
        <li>
          <CircleCheck size={17} strokeWidth={1.75} aria-hidden />
          <span>
            Unsubscribe confirmed · {since ?? "date not recorded"}
          </span>
        </li>
        <li>
          <Clock size={17} strokeWidth={1.75} aria-hidden />
          <span>{checkLine(item)}</span>
        </li>
      </ul>

      <p className={styles.note}>{coverageNote(item)}</p>

      {item.observation === "NEW_MAIL" ? (
        <>
          <p className={styles.note}>Some messages may still arrive after unsubscribing.</p>
          <div className={styles.cta}>
            <p className={styles.ctaText}>Still unwanted?</p>
            <Link href={`${basePath}/cleanup?review=${encodeURIComponent(item.senderId)}`} className={styles.review}>
              Review in Cleanup
              <ArrowRight size={18} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </>
      ) : null}

      {item.observation === "NOT_CHECKED" && item.notCheckedReason === "NO_DATE" ? (
        <p className={styles.note}>
          <Info size={15} strokeWidth={1.75} aria-hidden />
          Without that date, mail from before and after the unsubscribe can’t be told apart.
        </p>
      ) : null}
    </div>
  );
}

function checkLine(item: ArchiveItemDto): string {
  if (!item.check) {
    return item.notCheckedReason === "NO_DATE"
      ? "Not checked — the unsubscribe date is missing"
      : "Not checked since you unsubscribed";
  }
  const when = monthDay(item.check.at);
  if (item.observation === "NOT_CHECKED") return `Latest check · ${when} · ran within a day of unsubscribing`;
  return `Latest check · ${when} · ${
    item.check.found === 0 ? "no new mail" : `${plural(item.check.found, "email", "emails")} found`
  }`;
}

/** What the last check actually covered, so "no new mail" never says more. */
function coverageNote(item: ArchiveItemDto): string {
  const matched =
    item.matchedBy === "LIST_ID"
      ? "Matched by this mailing list’s ID."
      : `Matched by the sender address ${item.address}.`;

  if (!item.check) {
    return item.notCheckedReason === "NO_DATE"
      ? matched
      : `Gmail hasn’t been checked since this unsubscribe. Check again to look for mail received after it. ${matched}`;
  }

  const from = monthDay(item.check.from);
  const to = monthDay(item.check.to);
  const range = from === to ? `on ${to}` : `from ${from} to ${to}`;

  if (item.observation === "NOT_CHECKED") {
    return `The last check ran too soon after unsubscribing to tell. Check again in a day or two. ${matched}`;
  }

  const partial = item.check.partial && item.unsubscribedAt
    ? ` Mail between ${monthDay(item.unsubscribedAt)} and ${from} wasn’t part of that check.`
    : "";
  const later = " Anything newer shows up after the next check.";

  return `The last check read mail received ${range}.${partial}${later} ${matched}`;
}
