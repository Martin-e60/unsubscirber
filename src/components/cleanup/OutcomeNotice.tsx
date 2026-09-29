"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Clock,
  ExternalLink,
  Heart,
  MousePointerClick,
  X,
} from "lucide-react";
import { SENDER_STATUS, type SenderStatus } from "@/lib/constants";
import type { UnsubscribeResultDto } from "@/lib/api/types";
import styles from "./OutcomeNotice.module.css";

/**
 * What just happened, after a decision.
 *
 * Every unsubscribe result is shown for what it is. A request that was sent is
 * not dressed up as a confirmed removal, and a failure is not quietly dropped:
 * each one is listed, with its reason and a link to where it now lives in
 * Unsubscribed.
 */

export type Outcome =
  | {
      kind: "unsubscribe";
      items: { name: string; result: UnsubscribeResultDto }[];
      /** Selected senders that publish no unsubscribe method, so were left alone. */
      skipped: string[];
    }
  | { kind: "keep"; kept: { id: string; name: string }[]; failed: string[] }
  | { kind: "restored"; names: string[]; failed: string[] };

type Tone = "success" | "info" | "warning" | "danger";

const RESULT: Partial<
  Record<SenderStatus, { tone: Tone; label: string; group: (n: number) => string }>
> = {
  [SENDER_STATUS.UNSUBSCRIBED]: {
    tone: "success",
    label: "Unsubscribed",
    group: (n) => `${n} unsubscribed`,
  },
  [SENDER_STATUS.REQUESTED]: {
    tone: "info",
    label: "Request sent — removal not confirmed",
    group: (n) => `${n} ${n === 1 ? "request" : "requests"} sent, not confirmed`,
  },
  [SENDER_STATUS.MANUAL]: {
    tone: "warning",
    label: "Needs one more click",
    group: (n) => `${n} ${n === 1 ? "needs" : "need"} one more click`,
  },
  [SENDER_STATUS.FAILED]: {
    tone: "danger",
    label: "Couldn’t unsubscribe",
    group: (n) => `${n} failed`,
  },
};

const FALLBACK = { tone: "info" as Tone, label: "Status updated", group: (n: number) => `${n} updated` };

const ICON = {
  success: CircleCheck,
  info: Clock,
  warning: MousePointerClick,
  danger: CircleAlert,
};

/** The Unsubscribed tab each result is filed under. */
function tabFor(status: SenderStatus): string {
  return status === SENDER_STATUS.REQUESTED ||
    status === SENDER_STATUS.MANUAL ||
    status === SENDER_STATUS.FAILED
    ? status
    : SENDER_STATUS.UNSUBSCRIBED;
}

export function OutcomeNotice({
  outcome,
  basePath,
  working,
  onDismiss,
  onUndoKeep,
}: {
  outcome: Outcome;
  basePath: string;
  working: boolean;
  onDismiss: () => void;
  onUndoKeep: (items: { id: string; name: string }[]) => void;
}) {
  const dismiss = (
    <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
      <X size={16} strokeWidth={1.9} aria-hidden />
    </button>
  );

  if (outcome.kind === "keep" || outcome.kind === "restored") {
    const kept = outcome.kind === "keep" ? outcome.kept : [];
    const names = outcome.kind === "keep" ? kept.map((k) => k.name) : outcome.names;
    const failed = outcome.failed;

    return (
      <div className={styles.notice} data-tone={failed.length && !names.length ? "danger" : "success"}>
        <span className={styles.icon} aria-hidden="true">
          {outcome.kind === "keep" ? (
            <Heart size={18} strokeWidth={1.9} />
          ) : (
            <CircleCheck size={18} strokeWidth={1.9} />
          )}
        </span>
        <div className={styles.body}>
          {names.length ? (
            <p className={styles.title}>
              {outcome.kind === "keep"
                ? `Kept ${listNames(names)}.`
                : `${listNames(names)} ${names.length === 1 ? "is" : "are"} back in the list.`}
            </p>
          ) : null}
          {outcome.kind === "keep" && names.length ? (
            <p className={styles.detail}>
              {names.length === 1 ? "It stays" : "They stay"} in{" "}
              <Link href={`${basePath}/senders`} className={styles.link}>
                Senders
              </Link>
              , and you won’t be asked about {names.length === 1 ? "it" : "them"} here again.
            </p>
          ) : null}
          {failed.length ? (
            <p className={styles.detail} data-tone="danger">
              {outcome.kind === "keep" ? "Couldn’t keep" : "Couldn’t restore"} {listNames(failed)}. Its
              status may have changed in another tab — the list has been refreshed.
            </p>
          ) : null}
          {outcome.kind === "keep" && kept.length ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.textButton}
                disabled={working}
                onClick={() => onUndoKeep(kept)}
              >
                Undo
              </button>
            </div>
          ) : null}
        </div>
        {dismiss}
      </div>
    );
  }

  const { items, skipped } = outcome;
  const groups = new Map<SenderStatus, number>();
  for (const { result } of items) groups.set(result.status, (groups.get(result.status) ?? 0) + 1);

  const worst: Tone = groups.has(SENDER_STATUS.FAILED)
    ? "danger"
    : groups.has(SENDER_STATUS.MANUAL)
      ? "warning"
      : groups.has(SENDER_STATUS.REQUESTED)
        ? "info"
        : items.length
          ? "success"
          : "warning";

  const single = items.length === 1 && skipped.length === 0 ? items[0] : null;
  const Icon = ICON[worst];

  const title = single
    ? `${(RESULT[single.result.status] ?? FALLBACK).label}: ${single.name}`
    : items.length
      ? [...groups].map(([status, n]) => (RESULT[status] ?? FALLBACK).group(n)).join(" · ")
      : "Nothing was sent";

  const primaryTab = tabFor(
    [SENDER_STATUS.FAILED, SENDER_STATUS.MANUAL, SENDER_STATUS.REQUESTED].find((s) => groups.has(s)) ??
      SENDER_STATUS.UNSUBSCRIBED,
  );

  return (
    <div className={styles.notice} data-tone={worst}>
      <span className={styles.icon} aria-hidden="true">
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>

        {single ? (
          <ResultDetail result={single.result} />
        ) : items.length ? (
          <ul className={styles.items}>
            {items.map(({ name, result }) => {
              const meta = RESULT[result.status] ?? FALLBACK;
              return (
                <li key={result.senderId} className={styles.item} data-tone={meta.tone}>
                  <span className={styles.itemName}>{name}</span>
                  <span className={styles.itemStatus}>{meta.label}</span>
                  {result.status === SENDER_STATUS.FAILED ||
                  result.status === SENDER_STATUS.MANUAL ? (
                    <ResultDetail result={result} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {skipped.length ? (
          <p className={styles.detail}>
            Skipped {listNames(skipped)}: {skipped.length === 1 ? "it publishes" : "they publish"} no
            unsubscribe method Tidely can use, so {skipped.length === 1 ? "it’s" : "they’re"} still
            here to keep or review.
          </p>
        ) : null}

        {items.length ? (
          <div className={styles.actions}>
            <Link href={`${basePath}/unsubscribed?status=${primaryTab}`} className={styles.link}>
              {single ? "See it in Unsubscribed" : "See the outcomes in Unsubscribed"}
              <ArrowUpRight size={15} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        ) : null}
      </div>
      {dismiss}
    </div>
  );
}

function ResultDetail({ result }: { result: UnsubscribeResultDto }) {
  return (
    <p className={styles.detail}>
      {result.status === SENDER_STATUS.MANUAL && result.manualUrl ? (
        <>
          Their page needs you to confirm.{" "}
          <a href={result.manualUrl} target="_blank" rel="noreferrer noopener" className={styles.link}>
            Finish on their page
            <ExternalLink size={14} strokeWidth={1.9} aria-hidden />
          </a>
        </>
      ) : (
        result.detail
      )}
    </p>
  );
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}
