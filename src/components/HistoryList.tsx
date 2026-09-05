"use client";

import { useEffect, useState } from "react";
import { Badge } from "./ui/Badge";
import { Avatar } from "./ui/Avatar";
import { EmptyState } from "./ui/EmptyState";
import { api } from "@/lib/api/client";
import { ATTEMPT_STATUS } from "@/lib/constants";
import type { HistoryItemDto } from "@/lib/api/types";
import styles from "./HistoryList.module.css";

/**
 * Every unsubscribe attempt, newest first — successes and failures alike, so a
 * sender that did not work is explainable rather than mysterious.
 */

const METHOD_LABEL: Record<string, string> = {
  ONE_CLICK: "One-click",
  HTTP: "Link",
  MAILTO: "Email",
  BODY_LINK: "Link in message",
};

export function HistoryList() {
  const [items, setItems] = useState<HistoryItemDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setItems(await api.get<HistoryItemDto[]>("/api/history"));
      } catch {
        // Nothing to show is a perfectly normal state here.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Attempt history</h2>

      <div className={styles.panel}>
        {loading ? (
          <EmptyState title="Loading…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No attempts yet"
            description="Once you unsubscribe from something, every attempt shows up here — including the ones that did not work."
          />
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id} className={styles.row}>
                <Avatar name={item.senderName ?? item.senderAddress} size="sm" />

                <div className={styles.identity}>
                  <span className={styles.name}>
                    {item.senderName ?? item.senderAddress}
                  </span>
                  <span className={styles.detail}>{item.detail}</span>
                </div>

                <span className={styles.method}>
                  {METHOD_LABEL[item.method] ?? item.method}
                </span>

                <Badge
                  tone={
                    item.status === ATTEMPT_STATUS.SUCCESS
                      ? "success"
                      : item.status === ATTEMPT_STATUS.MANUAL_REQUIRED
                        ? "warning"
                        : "danger"
                  }
                >
                  {item.status === ATTEMPT_STATUS.SUCCESS
                    ? "Done"
                    : item.status === ATTEMPT_STATUS.MANUAL_REQUIRED
                      ? "Needs a click"
                      : "Failed"}
                </Badge>

                <time className={styles.time} dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
