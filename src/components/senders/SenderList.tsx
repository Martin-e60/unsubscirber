"use client";

import { SenderRow } from "@/components/senders/SenderRow";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SenderDto } from "@/lib/api/types";
import styles from "./SenderList.module.css";

export function SenderList({
  senders,
  loading,
  selected,
  pending,
  emptyTitle,
  emptyDescription,
  onToggle,
  onUnsubscribe,
  onKeep,
  onRollUp,
  onRestore,
}: {
  senders: SenderDto[];
  loading: boolean;
  selected: Set<string>;
  pending: Set<string>;
  emptyTitle: string;
  emptyDescription?: string;
  onToggle: (id: string) => void;
  onUnsubscribe: (id: string) => void;
  onKeep: (id: string) => void;
  onRollUp: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  if (loading && senders.length === 0) {
    return (
      <div className={styles.panel}>
        <ul className={styles.list}>
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className={styles.skeleton} aria-hidden="true" />
          ))}
        </ul>
        <span className="srOnly">Loading subscriptions</span>
      </div>
    );
  }

  if (senders.length === 0) {
    return (
      <div className={styles.panel}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <ul className={styles.list}>
        {senders.map((sender) => (
          <SenderRow
            key={sender.id}
            sender={sender}
            selected={selected.has(sender.id)}
            busy={pending.has(sender.id)}
            onToggle={() => onToggle(sender.id)}
            onUnsubscribe={() => onUnsubscribe(sender.id)}
            onKeep={() => onKeep(sender.id)}
            onRollUp={() => onRollUp(sender.id)}
            onRestore={() => onRestore(sender.id)}
          />
        ))}
      </ul>
    </div>
  );
}
