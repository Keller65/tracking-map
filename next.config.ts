import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/isync-api/:path*",
        destination: "https://isync-tracker-ws.vercel.app/api/:path*",
      },
    ];
  },
};

export default nextConfig;
