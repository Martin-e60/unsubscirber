import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Gmail scan runs inside route handlers and talks to Google over the
  // network, so it must never be statically pre-rendered or cached.
  allowedDevOrigins: ["127.0.0.1", "192.168.1.3"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
