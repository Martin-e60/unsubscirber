import type { Metadata } from "next";
// Manrope is the brand typeface. This package ships the variable font files
// themselves, so the font is self-hosted: no request to Google at runtime, no
// layout shift, and it works offline. Weights 200–800 all come from one file.
import "@fontsource-variable/manrope";
import "@/styles/globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, SITE_TAGLINE } from "@/lib/site";

/**
 * Site-wide metadata.
 *
 * `metadataBase` is what makes the social preview work: without it the
 * Open Graph image resolves to a relative path, which LinkedIn, Slack and the
 * rest quietly ignore. The image itself is generated at /opengraph-image.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "unsubscribe",
    "email subscriptions",
    "newsletters",
    "Gmail",
    "inbox cleanup",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
