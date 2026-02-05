import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "localhost",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/dashboard/vendas/nova",
        destination: "/dashboard/pdv",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
