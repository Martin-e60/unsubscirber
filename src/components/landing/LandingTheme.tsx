"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import theme from "./theme.module.css";
import styles from "./ThemeToggle.module.css";

/**
 * The landing page's light / dark switch.
 *
 * The shell owns the choice and writes it to data-theme on the page's root, so
 * every landing token flips together (theme.module.css) and nothing outside
 * this page can see it. It starts light, as designed; the choice is not stored
 * and lasts until the page is left.
 */

type Appearance = "light" | "dark";

const Appearances = createContext<{ appearance: Appearance; toggle: () => void } | null>(null);

export function LandingShell({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>("light");
  const toggle = () => setAppearance((now) => (now === "light" ? "dark" : "light"));

  return (
    <Appearances.Provider value={{ appearance, toggle }}>
      <div className={theme.theme} data-theme={appearance}>
        {children}
      </div>
    </Appearances.Provider>
  );
}

/** A half-black, half-white disc. Its colours follow the page, so it is always visible. */
export function ThemeToggle() {
  const state = useContext(Appearances);
  if (!state) return null;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={state.appearance === "dark"}
      aria-label="Dark mode"
      className={styles.toggle}
      onClick={state.toggle}
    >
      <span className={styles.disc} aria-hidden="true" />
    </button>
  );
}
