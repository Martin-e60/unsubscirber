import { ImageResponse } from "next/og";

/**
 * The browser tab icon: the wordmark's square form, in brand purple.
 *
 * Generated rather than shipped as a file so it follows the brand colour and
 * needs no binary in the repository.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7065f0",
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 700,
          borderRadius: 7,
          fontFamily: "sans-serif",
        }}
      >
        T
      </div>
    ),
    size,
  );
}
