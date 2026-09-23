import type { NextConfig } from "next";

const GEOVALLAS_API_BASE =
  process.env.GEOVALLAS_API_BASE ?? "https://isync-tracker-ws.vercel.app";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.3"],
  async rewrites() {
    return [
      {
        source: "/isync-api/:path*",
        destination: "https://isync-tracker-ws.vercel.app/api/:path*",
      },
      {
        source: "/api/geovallas/:path*",
        destination: `${GEOVALLAS_API_BASE}/api/geovallas/:path*`,
      },
    ];
  },
};

export default nextConfig;
