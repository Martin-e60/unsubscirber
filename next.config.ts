import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Gmail scan runs inside route handlers and talks to Google over the
  // network, so it must never be statically pre-rendered or cached.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
