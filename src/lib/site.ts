/**
 * Facts about this deployment, in one place.
 *
 * Anything not known for certain is left empty rather than guessed, and every
 * component that renders one of these values hides the link when it is empty.
 * That is deliberate: a portfolio project that links to a profile which does
 * not exist is worse than one that links to nothing.
 */

/** Public source repository, or "" to hide the link. */
export const REPO_URL = "https://github.com/Martin-e60/unsubscirber";

/** The author's own profiles, linked from the landing footer. */
export const SOCIAL_LINKS = {
  linkedin: "https://www.linkedin.com/in/martin-marinov-2677b0381/",
  github: "https://github.com/Martin-e60",
  instagram: "https://www.instagram.com/_martin.e60/",
} as const;

/** Where the app is served from. Used for canonical and social-preview URLs. */
export const SITE_URL = (process.env.APP_URL ?? "https://tidely.vercel.app").replace(
  /\/$/,
  "",
);

export const SITE_NAME = "Tidely";

export const SITE_TAGLINE = "Find your email subscriptions and leave the ones you don't want";

export const SITE_DESCRIPTION =
  "Tidely is a free tool that scans your Gmail for mailing lists, groups them by sender, and unsubscribes from the ones you choose. Try the full demo with sample data — no account needed.";
