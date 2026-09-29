"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  MailCheck,
  MousePointer2,
  ScanLine,
  Send,
  type LucideIcon,
} from "lucide-react";
import { relativeTime } from "@/lib/home/format";
import type { ActivityItem, ActivityKind } from "@/lib/home/activity";
import type { StatsDto } from "@/lib/api/types";
import styles from "./HomeCards.module.css";

/**
 * The two cards at the foot of Home.
 *
 * Both are summaries that point elsewhere. Neither repeats the Cleanup list,
 * and neither offers Keep or Unsubscribe — the rows lead to the screen where
 * that decision is made.
 */

// --- Needs your attention ---------------------------------------------------

export function Attention({
  stats,
  basePath,
}: {
  stats: StatsDto | null;
  basePath: string;
}) {
  const needsClick = stats?.needsClick ?? 0;
  const failed = stats?.failed ?? 0;
  const total = needsClick + failed;
  const results = `${basePath}/unsubscribed`;

  return (
    <section className={styles.card} aria-labelledby="attention-title">
      <header className={styles.head}>
        <h2 className={styles.title} id="attention-title">
          Needs your attention
        </h2>
        {total > 0 ? (
          <span className={styles.badge}>
            {total}
            <span className="srOnly"> {total === 1 ? "item" : "items"}</span>
          </span>
        ) : null}
      </header>

      {stats === null ? (
        <div className={styles.placeholder} aria-hidden="true" />
      ) : total === 0 ? (
        <div className={styles.calm}>
          <CircleCheck className={styles.calmIcon} size={22} strokeWidth={1.75} aria-hidden />
          <div>
            <p className={styles.calmTitle}>You’re all caught up.</p>
            <p className={styles.calmBody}>
              No unsubscribe is waiting on a click, and none needs a second look.
            </p>
          </div>
        </div>
      ) : (
        <ul className={styles.list}>
          {needsClick > 0 ? (
            <li>
              <Link href={`${basePath}/cleanup?status=MANUAL`} className={styles.row}>
                <span className={styles.rowIcon} aria-hidden="true">
                  <MousePointer2 size={18} strokeWidth={1.75} />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>
                    {needsClick} {needsClick === 1 ? "needs" : "need"} one more click
                  </span>
                  <span className={styles.rowBody}>Finish on the sender’s website.</span>
                </span>
                <ChevronRight className={styles.chevron} size={18} strokeWidth={1.75} aria-hidden />
              </Link>
            </li>
          ) : null}
          {failed > 0 ? (
            <li>
              <Link href={`${basePath}/cleanup?status=FAILED`} className={styles.row}>
                <span className={styles.rowIcon} aria-hidden="true">
                  <CircleAlert size={18} strokeWidth={1.75} />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>
                    {failed} {failed === 1 ? "attempt needs" : "attempts need"} a review
                  </span>
                  <span className={styles.rowBody}>See what happened and your options.</span>
                </span>
                <ChevronRight className={styles.chevron} size={18} strokeWidth={1.75} aria-hidden />
              </Link>
            </li>
          ) : null}
        </ul>
      )}

      <footer className={styles.foot}>
        <p className={styles.footNote}>You stay in control of every request.</p>
        <Link href={results} className={styles.footLink}>
          Review results
          <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </footer>
    </section>
  );
}

// --- Recent activity --------------------------------------------------------

const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  scan: ScanLine,
  removed: MailCheck,
  sent: Send,
};

export function Activity({
  items,
  basePath,
}: {
  items: ActivityItem[] | null;
  basePath: string;
}) {
  return (
    <section className={styles.card} aria-labelledby="activity-title">
      <header className={styles.head}>
        <h2 className={styles.title} id="activity-title">
          Recent activity
        </h2>
        <Link href={`${basePath}/unsubscribed`} className={styles.headLink}>
          View history
          <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </header>

      {items === null ? (
        <div className={styles.placeholder} aria-hidden="true" />
      ) : items.length === 0 ? (
        <div className={styles.calm}>
          <ScanLine className={styles.calmIcon} size={22} strokeWidth={1.75} aria-hidden />
          <div>
            <p className={styles.calmTitle}>No activity yet.</p>
            <p className={styles.calmBody}>
              Finished scans, confirmed removals and requests sent will appear here.
            </p>
          </div>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const Icon = ACTIVITY_ICON[item.kind];
            return (
              <li key={item.id} className={styles.event} data-kind={item.kind}>
                <span className={styles.rowIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{item.title}</span>
                  <span className={styles.rowBody}>{item.detail}</span>
                </span>
                <time className={styles.time} dateTime={item.at}>
                  {relativeTime(item.at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
