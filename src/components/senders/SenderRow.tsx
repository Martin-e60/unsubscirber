"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Avatar } from "@/components/ui/Avatar";
import { STATUS_LABEL, STATUS_TONE, formatRelativeDate } from "@/components/senders/senderStatus";
import { SENDER_STATUS } from "@/lib/constants";
import type { SenderDto } from "@/lib/api/types";
import styles from "./SenderRow.module.css";

/**
 * One subscription in the list.
 *
 * Knows nothing about fetching. It receives a sender and some callbacks and it
 * renders — so this file can be restyled or rebuilt without touching anything
 * else in the app.
 */

export function SenderRow({
  sender,
  selected,
  busy,
  onToggle,
  onUnsubscribe,
  onKeep,
  onRollUp,
  onRestore,
}: {
  sender: SenderDto;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onUnsubscribe: () => void;
  onKeep: () => void;
  onRollUp: () => void;
  onRestore: () => void;
}) {
  const decided =
    sender.status === SENDER_STATUS.UNSUBSCRIBED ||
    sender.status === SENDER_STATUS.KEPT ||
    sender.status === SENDER_STATUS.ROLLED_UP;

  const label = sender.name ?? sender.address;

  return (
    <li className={styles.row} data-busy={busy || undefined}>
      <Checkbox
        label={`Select ${label}`}
        hideLabel
        checked={selected}
        disabled={!sender.canUnsubscribe || busy}
        onChange={onToggle}
      />

      <Avatar name={label} />

      <div className={styles.identity}>
        <span className={styles.name}>{label}</span>
        <span className={styles.detail}>
          {sender.status === SENDER_STATUS.REQUESTED
            ? "Email request sent. Removal is not confirmed; emails may still arrive."
            : sender.sampleSubject ?? sender.address}
        </span>
      </div>

      <div className={styles.meta}>
        <span className={styles.rate}>
          {sender.perMonth.toLocaleString()} <span className={styles.unit}>/ month</span>
        </span>
        <span className={styles.date}>
          Last email {formatRelativeDate(sender.lastSeenAt).toLowerCase()}
        </span>
      </div>

      <div className={styles.actions}>
        {sender.manualUrl ? (
          <a
            className={styles.manualLink}
            href={sender.manualUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Finish
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
          </a>
        ) : null}

        {decided ? (
          <>
            <Badge tone={STATUS_TONE[sender.status]}>
              {STATUS_LABEL[sender.status]}
            </Badge>
            {sender.status === SENDER_STATUS.UNSUBSCRIBED ? null : (
              <Button variant="ghost" size="sm" onClick={onRestore}>
                Undo
              </Button>
            )}
          </>
        ) : sender.status === SENDER_STATUS.UNSUBSCRIBING || sender.status === SENDER_STATUS.REQUESTED ? (
          <Badge tone="info">{STATUS_LABEL[sender.status]}</Badge>
        ) : (
          <>
            <Button variant="softSuccess" size="sm" onClick={onKeep} disabled={busy}>
              Keep
            </Button>
            <Button variant="softPrimary" size="sm" onClick={onRollUp} disabled={busy}>
              Roll up
            </Button>
            <Button
              variant="softDanger"
              size="sm"
              loading={busy}
              disabled={!sender.canUnsubscribe}
              onClick={onUnsubscribe}
            >
              Unsubscribe
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
