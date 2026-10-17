"use client";

import { Clock, Mail, type LucideIcon } from "lucide-react";
import { useCountTo } from "@/hooks/useCountTo";
import { formatEstimate, formatMinutes } from "@/lib/home/format";
import type { StatsDto } from "@/lib/api/types";
import styles from "./Impact.module.css";

/**
 * The impact row: three figures, all derived from confirmed removals only.
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
      <Icon className={styles.icon} size={30} strokeWidth={2.1} aria-hidden />
      <div>
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
      </div>
    </li>
  );
}

export function Impact({ stats }: { stats: StatsDto | null }) {
  const confirmed = useCountTo(stats?.confirmedUnsubscribes ?? null);
  const fewer = useCountTo(stats?.fewerEmailsPerMonth ?? null);
  const saved = useCountTo(stats?.timeSavedPerMonthSeconds ?? null);

  return (
    <section className={styles.impact} aria-labelledby="impact-title">
      <h2 className="srOnly" id="impact-title">
        Your impact
      </h2>
      <p className={styles.basis}>Based on confirmed removals</p>

      <ul className={styles.figures} aria-busy={stats === null}>
        <Figure
          icon={Mail}
          label="Confirmed unsubscribes"
          value={confirmed === null ? "—" : Math.round(confirmed).toLocaleString("en")}
        />
        <Figure
          icon={Mail}
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
    </section>
  );
}
