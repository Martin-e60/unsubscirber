import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    ...(process.env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((host) => host.trim()).filter(Boolean),
  ],
};

export default nextConfig;
