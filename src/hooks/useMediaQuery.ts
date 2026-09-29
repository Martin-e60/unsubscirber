"use client";

import { useEffect, useState } from "react";

/**
 * Whether a media query matches, kept in step as the window changes.
 *
 * Null until the first render in the browser, so server-rendered markup never
 * guesses at a viewport it cannot see.
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}
