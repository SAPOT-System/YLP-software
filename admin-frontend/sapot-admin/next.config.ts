import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  allowedDevOrigins: [
    "192.168.254.106", // your LAN IP (NO http, no port)
    "*",
  ],
};

export default nextConfig;
