import type { Metadata } from "next";
// Manrope is the brand typeface. This package ships the variable font files
// themselves, so the font is self-hosted: no request to Google at runtime, no
// layout shift, and it works offline. Weights 200–800 all come from one file.
import "@fontsource-variable/manrope";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Tidely — A tidier inbox, effortlessly",
  description:
    "Find, organize and remove the emails you don't need — so you can focus on what matters.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
