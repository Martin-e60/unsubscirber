"use client";

import { useId, useState } from "react";
import { Clock, Info, MailCheck, MailMinus, type LucideIcon } from "lucide-react";
import { useCountTo } from "@/hooks/useCountTo";
import { formatEstimate, formatMinutes } from "@/lib/home/format";
import { SECONDS_SAVED_PER_EMAIL } from "@/lib/constants";
import type { StatsDto } from "@/lib/api/types";
import styles from "./Impact.module.css";

/**
 * "Your impact": three figures, all derived from confirmed removals only.
 *
 * The first is a count of real events. The other two are estimates — how
 * often those senders wrote before, and what that mail cost at five seconds
 * an email — so they carry "≈" and say what they are based on. Requests still
 * waiting, attempts that need a click, and failures never feed them.
 */

function Figure({
  icon: Icon,
  label,
  value,
  estimate = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  estimate?: boolean;
}) {
  const missing = value === "—";

  // Read aloud as "about 180, Fewer emails / month" — number first, as seen.
  return (
    <li className={styles.figure}>
      <Icon className={styles.icon} size={22} strokeWidth={1.6} aria-hidden />
      <p className={styles.value}>
        {missing ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="srOnly">Not available yet:</span>
          </>
        ) : (
          <>
            {estimate ? (
              <>
                <span aria-hidden="true">≈</span>
                <span className="srOnly">about </span>
              </>
            ) : null}
            {value}
          </>
        )}
      </p>
      <p className={styles.label}>{label}</p>
    </li>
  );
}

export function Impact({ stats }: { stats: StatsDto | null }) {
  const [more, setMore] = useState(false);
  const moreId = useId();

  const confirmed = useCountTo(stats?.confirmedUnsubscribes ?? null);
  const fewer = useCountTo(stats?.fewerEmailsPerMonth ?? null);
  const saved = useCountTo(stats?.timeSavedPerMonthSeconds ?? null);

  const none = stats !== null && stats.confirmedUnsubscribes === 0;

  return (
    <section className={styles.impact} aria-labelledby="impact-title">
      <div className={styles.head}>
        <h2 className={styles.eyebrow} id="impact-title">
          Your impact
        </h2>
        <p className={styles.basis}>Based on confirmed removals</p>
      </div>

      <ul className={styles.figures} aria-busy={stats === null}>
        <Figure
          icon={MailCheck}
          label="Confirmed unsubscribes"
          value={confirmed === null ? "—" : Math.round(confirmed).toLocaleString("en")}
        />
        <Figure
          icon={MailMinus}
          label="Fewer emails / month"
          value={fewer === null ? "—" : formatEstimate(fewer)}
          estimate
        />
        <Figure
          icon={Clock}
          label="Time saved / month"
          value={saved === null ? "—" : formatMinutes(saved)}
          estimate
        />
      </ul>

      <div className={styles.note}>
        <p>
          {none
            ? "The monthly estimates appear after your first confirmed unsubscribe. "
            : ""}
          Monthly figures are estimates from past sending frequency and{" "}
          {SECONDS_SAVED_PER_EMAIL} seconds per email.
        </p>
        <button
          type="button"
          className={styles.info}
          aria-expanded={more}
          aria-controls={moreId}
          onClick={() => setMore((value) => !value)}
        >
          <Info size={16} strokeWidth={1.75} aria-hidden />
          <span className="srOnly">How these figures are worked out</span>
        </button>
      </div>

      <div id={moreId} className={styles.more} data-open={more || undefined} inert={!more}>
        <div className={styles.moreClip}>
          <p>
            Only senders that confirmed your removal are counted. For each, Tidely
            takes how many of its emails it saw and divides by the period they
            covered — at least one month — to get a monthly rate. Requests still
            waiting, attempts that need a click and failures are left out, and
            Tidely does not watch your inbox afterwards, so these are estimates,
            not a count of emails that stopped.
          </p>
        </div>
      </div>
    </section>
  );
}
