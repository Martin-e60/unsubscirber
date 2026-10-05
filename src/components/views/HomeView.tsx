"use client";

import { useCallback, useMemo } from "react";
import { CircleAlert, FlaskConical, Mail } from "lucide-react";
// The short serif accent (the person's name) — the same face as the landing page.
import "@fontsource-variable/newsreader/wght-italic.css";
import { useApp } from "@/components/layout/AppShell";
import { NextStep } from "@/components/home/NextStep";
import { Impact } from "@/components/home/Impact";
import { Activity, Attention } from "@/components/home/HomeCards";
import { useScan } from "@/hooks/useScan";
import { useHistory } from "@/hooks/useHistory";
import { buildActivity } from "@/lib/home/activity";
import styles from "./HomeView.module.css";

/**
 * Home, inside the app and the demo.
 *
 * Answers, top to bottom: is my mailbox connected, what should I do now, what
 * has this been worth, what is waiting on me, and what happened recently.
 * The sender list itself lives in Cleanup — Home points there rather than
 * repeating it.
 *
 * Every figure comes from the same API the rest of the app uses, so in the
 * demo it is the demo's sample data, and in a real account it is that
 * account's data. No figure from the design mock-up is carried over.
 */
export function HomeView() {
  const { stats, refreshStats, userName, accountConnected, accountEmail, mailbox, basePath, demo } = useApp();
  const history = useHistory();

  const afterScan = useCallback(() => {
    void refreshStats();
    void history.refresh();
  }, [refreshStats, history]);

  const scan = useScan({ onFinished: afterScan, resume: false });

  const activity = useMemo(
    () =>
      history.items === null
        ? null
        : buildActivity({ history: history.items, scan: scan.progress }),
    [history.items, scan.progress],
  );

  // First name only, and only if we actually have one. An email address is
  // not a name, so without one the greeting simply does not use it.
  const firstName = userName?.trim().split(/\s+/)[0] || null;

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.crumb}>Home</p>
        <div className={styles.head}>
        <div>
          <h1 className={styles.title}>
            Good to see you
            {firstName ? (
              <>
                , <span className={styles.name}>{firstName}.</span>
              </>
            ) : (
              "."
            )}
          </h1>
          <p className={styles.lede}>
            Here’s where your inbox stands — and what you can do next.
          </p>
        </div>

        <p
          className={styles.status}
          data-state={demo ? "demo" : mailbox?.needsReconnect ? "off" : accountConnected ? "on" : "off"}
        >
          {demo ? (
            <>
              <FlaskConical size={17} strokeWidth={1.75} aria-hidden />
              Sample mailbox
            </>
          ) : accountConnected === null ? (
            <span className={styles.statusLoading}>Checking Gmail…</span>
          ) : accountConnected && mailbox?.needsReconnect ? (
            <>
              <CircleAlert size={17} strokeWidth={1.75} aria-hidden />
              <span className="srOnly">Needs reconnecting: </span>
              <span className={styles.statusText}>{accountEmail}</span>
            </>
          ) : accountConnected ? (
            <>
              <Mail size={17} strokeWidth={1.75} aria-hidden />
              <span className="srOnly">Gmail connected: </span>
              <span className={styles.statusText}>{accountEmail}</span>
            </>
          ) : (
            <>
              <CircleAlert size={17} strokeWidth={1.75} aria-hidden />
              Gmail not connected
            </>
          )}
        </p>
        </div>
      </header>

      <NextStep
        connected={accountConnected}
        stats={stats}
        scan={scan}
        basePath={basePath}
      />

      {accountConnected === false ? null : (
        <>
          <Impact stats={stats} />

          <div className={styles.cards}>
            <Attention stats={stats} basePath={basePath} />
            <Activity items={activity} basePath={basePath} />
          </div>
        </>
      )}

      <footer className={styles.foot}>
        <p>A little less noise. A little more room.</p>
        <p>Your inbox. Your choice.</p>
      </footer>
    </div>
  );
}
