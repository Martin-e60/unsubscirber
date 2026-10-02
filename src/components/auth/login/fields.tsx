"use client";

import { useRef, useState, type Ref } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./Login.module.css";

/**
 * A password input with a show/hide button. Toggling keeps the value and
 * leaves focus where it was: pressing it from the keyboard keeps focus on the
 * button, clicking it while typing keeps the caret in the field.
 */
export function PasswordField({
  id,
  name,
  autoComplete,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder,
  ref,
}: {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className={styles.password}>
      <input
        ref={(node) => {
          inputRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as { current: HTMLInputElement | null }).current = node;
        }}
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        maxLength={128}
        placeholder={placeholder}
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className={styles.reveal}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={id}
        // A mouse press would steal focus from the field being typed in.
        onMouseDown={(event) => {
          if (document.activeElement === inputRef.current) event.preventDefault();
        }}
        onClick={() => {
          const input = inputRef.current;
          const typing = document.activeElement === input;
          const caret = input ? [input.selectionStart, input.selectionEnd] : null;
          setVisible((shown) => !shown);
          if (typing && input && caret) {
            window.requestAnimationFrame(() => {
              input.focus();
              input.setSelectionRange(caret[0], caret[1]);
            });
          }
        }}
      >
        {visible ? <EyeOff size={20} strokeWidth={1.8} aria-hidden /> : <Eye size={20} strokeWidth={1.8} aria-hidden />}
      </button>
    </div>
  );
}

/**
 * Google's "G", as published in Google's sign-in branding guidelines, in
 * Google's own colours — the only colours on these pages outside the palette.
 */
export function GoogleMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
