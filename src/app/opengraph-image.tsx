import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

/**
 * The social preview card.
 *
 * Drawn here rather than shipped as a PNG so it stays in step with the brand
 * tokens and needs no binary in the repository. Next renders it once and caches
 * it, and the metadata in layout.tsx points at it automatically.
 */

export const alt =
  "Tidely — find your email subscriptions and unsubscribe from the ones you don't want";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#f7f8fc",
          backgroundImage:
            "radial-gradient(900px 480px at 88% -10%, #eeecff 0%, rgba(247,248,252,0) 62%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#7065f0",
              color: "#ffffff",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            T
          </div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: "#20212a" }}>
            {SITE_NAME}
            <span style={{ color: "#7065f0" }}>.</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#20212a",
              maxWidth: 900,
            }}
          >
            Find every mailing list in your inbox.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              lineHeight: 1.4,
              color: "#6b6f7e",
              maxWidth: 860,
            }}
          >
            A free tool that groups your Gmail subscriptions by sender and
            unsubscribes from the ones you choose.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {["Free", "Demo needs no account", "Gmail"].map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                border: "1px solid #dcdee8",
                background: "#ffffff",
                color: "#6b6f7e",
                fontSize: 26,
                fontWeight: 600,
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
