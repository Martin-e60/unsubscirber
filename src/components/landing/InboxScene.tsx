"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Check, Mail as MailIcon } from "lucide-react";
import {
  CARD,
  GHOSTS,
  MID_OPACITY,
  MID_SCALE,
  OPENING,
  OPENING_KEPT,
  POOL_SIZE,
  ROW,
  ROW_COUNT,
  SLOTS,
  STAGE,
  startInboxScene,
  type Mail,
} from "./sceneEngine";
import styles from "./InboxScene.module.css";

/**
 * The animated inbox beside the hero heading.
 *
 * Illustrative emails arrive, the unwanted ones dissolve into particles and the
 * ones worth keeping settle into a short stack. It runs until the hero leaves
 * the screen, then pauses; the motion lives in ./sceneEngine.ts.
 *
 * What is rendered here is the opening composition, so the scene is complete
 * before any script runs, if it fails, and for reduced motion (which gets this
 * still frame with a still particle cloud). It is decoration: hidden from
 * assistive technology and never in the way of a click.
 */

/** A length in stage units. */
const u = (n: number) => `calc(${n} * var(--u))`;

const cardTransform = (x: number, y: number, r: number, k: number) =>
  `translate(${u(x - CARD.w / 2)}, ${u(y - CARD.h / 2)}) rotate(${r}deg) scale(${k})`;

/** Lines the particles seem to follow, from the cloud down towards the stack. */
const STREAKS = Array.from({ length: 10 }, (_, i) => {
  const d =
    `M ${430 + i * 9} ${340 + i * 14} ` +
    `C ${440 + i * 6} 560, ${470 + i * 20} ${760 + i * 4}, ${560 + i * 26} 900`;
  return { d, width: 0.6 + (i % 3) * 0.3, opacity: 0.07 + (i % 4) * 0.03 };
});

function MailCard({ mail, className, style, live }: {
  mail?: Mail;
  className?: string;
  style: CSSProperties;
  live?: boolean;
}) {
  return (
    <div className={[styles.card, className].filter(Boolean).join(" ")} style={style} data-card={live ? "" : undefined}>
      <span className={styles.icon}>
        <MailIcon strokeWidth={1.6} />
      </span>
      <span className={styles.text}>
        <span className={styles.sender} data-sender>
          {mail?.sender}
        </span>
        <span className={styles.subject} data-subject>
          {mail?.subject}
        </span>
      </span>
      <span className={styles.time} data-time>
        {mail?.time}
      </span>
    </div>
  );
}

export function InboxScene() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = () => {
      try {
        return startInboxScene(root, !motion.matches);
      } catch {
        // The opening composition is already on screen; leave it there.
        return () => {};
      }
    };
    let stop = start();
    const restart = () => {
      stop();
      stop = start();
    };
    motion.addEventListener("change", restart);
    return () => {
      motion.removeEventListener("change", restart);
      stop();
    };
  }, []);

  return (
    <div className={styles.scene} ref={ref} aria-hidden="true">
      <div className={styles.stage} data-stage>
        {GHOSTS.map((ghost, i) => (
          <MailCard
            key={`ghost-${i}`}
            mail={ghost.mail}
            className={styles.ghost}
            style={
              {
                transform: cardTransform(ghost.x, ghost.y, ghost.r, ghost.k),
                "--o": ghost.o,
                "--b": `${ghost.b}px`,
                "--d": `${16 + ((i * 7) % 11)}s`,
                "--delay": `${-i * 3.1}s`,
                "--dx": i % 2 ? 6 : -5,
                "--dy": i % 3 ? -5 : 4,
              } as CSSProperties
            }
          />
        ))}

        <svg className={styles.streaks} viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} preserveAspectRatio="none">
          {STREAKS.map((streak, i) => (
            <path
              key={i}
              className={styles.streak}
              d={streak.d}
              strokeWidth={streak.width}
              strokeOpacity={streak.opacity}
              style={{ "--delay": `${-i * 0.9}s` } as CSSProperties}
            />
          ))}
        </svg>

        {Array.from({ length: POOL_SIZE }, (_, i) => {
          const opening = OPENING[i];
          if (!opening) {
            return (
              <MailCard key={i} live style={{ visibility: "hidden", opacity: 0 }} />
            );
          }
          const slot = SLOTS[opening.slot];
          return (
            <MailCard
              key={i}
              live
              mail={opening.mail}
              style={{
                transform: cardTransform(slot.x, slot.y, slot.r, slot.mid ? MID_SCALE : 1),
                opacity: slot.mid ? MID_OPACITY : 1,
                zIndex: slot.mid ? 2 : 4,
              }}
            />
          );
        })}

        <canvas className={styles.particles} />

        <p className={styles.label}>Only what matters.</p>

        {Array.from({ length: ROW_COUNT + 1 }, (_, i) => {
          const kept = OPENING_KEPT[i];
          return (
            <div
              key={i}
              className={styles.row}
              data-row
              style={{
                transform: `translate(${u(ROW.x)}, ${u(ROW.y + Math.min(i, ROW_COUNT) * ROW.gap)})`,
                opacity: kept ? 1 : 0,
                visibility: kept ? "visible" : "hidden",
              }}
            >
              <span className={styles.avatar} data-initials>
                {kept?.initials}
              </span>
              <span className={styles.text}>
                <span className={styles.rowSender} data-sender>
                  {kept?.sender}
                </span>
                <span className={styles.rowSubject} data-subject>
                  {kept?.subject}
                </span>
              </span>
              <span className={styles.rowTime} data-time>
                {kept?.time}
              </span>
              <span className={styles.check}>
                <Check strokeWidth={2} />
              </span>
            </div>
          );
        })}

        <span className={styles.pill} data-pill>
          <span className={styles.pillCheck}>
            <Check strokeWidth={2.5} />
          </span>
          Unsubscribed
        </span>
      </div>
    </div>
  );
}
