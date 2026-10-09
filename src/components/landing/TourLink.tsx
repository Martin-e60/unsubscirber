"use client";

import type { MouseEvent, ReactNode } from "react";

/**
 * A link to a section of this page that scrolls there smoothly — unless the
 * visitor prefers reduced motion, in which case the browser's own anchor jump
 * is left alone. Without JavaScript it is an ordinary anchor.
 */
export function TourLink({
  href,
  className,
  children,
}: {
  href: `#${string}`;
  className?: string;
  children: ReactNode;
}) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.pushState(null, "", href);
  }

  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
