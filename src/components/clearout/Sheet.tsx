"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./Sheet.module.css";

/**
 * A modal built on the native <dialog>: the review before Archive or Trash,
 * a message preview, History, the permission explanation.
 *
 * showModal() makes the rest of the page inert, so focus cannot wander behind
 * it, and Escape closes it. Focus goes back to whatever opened it. While
 * `locked` (an action is running) it cannot be dismissed.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "center",
  locked = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** "side": a drawer from the right (a sheet from the bottom on phones). */
  variant?: "center" | "side";
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    }
  }, [open]);

  // Unmounting while open must not leave the page inert.
  useEffect(() => () => ref.current?.close(), []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      data-variant={variant}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!lockedRef.current) onCloseRef.current();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget && !lockedRef.current) onCloseRef.current();
      }}
    >
      {/* Kept while closing, so the fade-out has something to fade. */}
      <div className={styles.frame}>
          <header className={styles.head}>
            <div className={styles.headText}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {description ? (
                <div id={descriptionId} className={styles.description}>
                  {description}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={locked}
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.9} aria-hidden />
            </button>
          </header>
          {children ? <div className={styles.body}>{children}</div> : null}
          {footer ? <footer className={styles.foot}>{footer}</footer> : null}
      </div>
    </dialog>
  );
}
