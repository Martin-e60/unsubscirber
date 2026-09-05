import styles from "./Avatar.module.css";

/**
 * A rounded-square initial avatar.
 *
 * The background is derived from the text, so a given sender always gets the
 * same colour without storing anything. To use real sender logos later, swap
 * the contents of this component for an <img> and nothing else changes.
 */

const TINTS = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-danger)",
  "#f0a13a",
  "#4d9bf0",
  "#a568e0",
];

export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const initials = toInitials(name);
  const tint = TINTS[hash(name) % TINTS.length];

  return (
    <span
      className={`${styles.avatar} ${styles[size]}`}
      style={{ background: tint }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function toInitials(value: string): string {
  const cleaned = value.replace(/@.*$/, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // One word gets one letter — "A" reads as a mark, "AL" reads as a mistake.
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hash(value: string): number {
  let total = 0;
  for (let i = 0; i < value.length; i++) total = (total * 31 + value.charCodeAt(i)) >>> 0;
  return total;
}
