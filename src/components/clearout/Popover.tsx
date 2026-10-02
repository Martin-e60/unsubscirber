"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import styles from "./Popover.module.css";

/**
 * A panel that opens from a control: the sender picker, the date choices,
 * the scope and sort menus, the label list.
 *
 * Wide screens: anchored under (or above) its trigger, on whichever side has
 * room, and never taller than that room — longer contents scroll inside the
 * panel instead of running off the page. Phones: a sheet from
 * the bottom with a backdrop, so it is never squeezed beside the trigger.
 * Either way it closes on Escape, on a click outside and when focus leaves,
 * and Escape returns focus to the trigger.
 */
export function Popover({
  open,
  onClose,
  triggerRef,
  label,
  children,
  align = "start",
  placement = "below",
  width,
  initialFocus = "first",
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  /** Names the panel for assistive technology, and titles the phone sheet. */
  label: string;
  children: ReactNode;
  align?: "start" | "end" | "stretch";
  placement?: "below" | "above";
  width?: string;
  /** Where focus lands: the first control, or the panel itself. */
  initialFocus?: "first" | "panel";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ placement: "below" | "above"; maxHeight: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Before paint: choose the side with room and cap the height to it.
  useLayoutEffect(() => {
    if (!open) {
      setFit(null);
      return;
    }
    const place = () => {
      const panel = panelRef.current;
      const trigger = triggerRef.current;
      if (!panel || !trigger || window.matchMedia("(max-width: 44rem)").matches) {
        setFit(null);
        return;
      }
      const margin = 12;
      const rect = trigger.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - margin - 8;
      const above = rect.top - margin - 8;
      const natural = panel.scrollHeight;
      const preferred = placement === "below" ? below : above;
      const other = placement === "below" ? above : below;
      const side =
        natural <= preferred || preferred >= other ? placement : placement === "below" ? "above" : "below";
      setFit({ placement: side, maxHeight: Math.max(160, side === placement ? preferred : other) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, placement, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const target =
      initialFocus === "first"
        ? panel.querySelector<HTMLElement>(
            "[data-autofocus], input:not([disabled]), [role=menuitemradio], [role=menuitem], [role=option], button:not([disabled])",
          )
        : null;
    (target ?? panel).focus({ preventScroll: true });

    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (panel.contains(node) || triggerRef.current?.contains(node)) return;
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    panel.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      panel.removeEventListener("keydown", onKeyDown);
    };
  }, [open, initialFocus, triggerRef]);

  if (!open) return null;

  return (
    <>
      <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        data-align={align}
        data-placement={fit?.placement ?? placement}
        style={{
          ...(width ? { inlineSize: width } : {}),
          ...(fit ? { maxBlockSize: `${fit.maxHeight}px`, overflowY: "auto" as const } : {}),
        }}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (!next) return;
          if (panelRef.current?.contains(next) || triggerRef.current?.contains(next)) return;
          onClose();
        }}
      >
        <p className={styles.sheetTitle} aria-hidden="true">
          {label}
        </p>
        {children}
      </div>
    </>
  );
}

/**
 * Arrow-key movement among a menu's items, as menus are expected to behave.
 * Attach to the element holding the items.
 */
export function menuKeys(event: React.KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      "[role=menuitem]:not([disabled]), [role=menuitemradio]:not([disabled]), [role=option]",
    ),
  ];
  if (items.length === 0) return;
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (current + 1) % items.length
          : (current - 1 + items.length) % items.length;
  items[next].focus();
}
