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
  async headers() {
    // Q5.3: CSP enforce em produção; report-only fora dela.
    // Override: defina CSP_MODE=report-only no env pra forçar report-only mesmo
    // em prod (ex.: voltar atrás se uma diretiva nova quebrar algo).
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us.i.posthog.com https://us-assets.i.posthog.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https: http://localhost:*",
      "connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com https://api.anthropic.com https://api.asaas.com https://api-sandbox.asaas.com https://*.supabase.co https://api.focusnfe.com.br https://homologacao.focusnfe.com.br https://*.neon.tech",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    const enforce =
      process.env.CSP_MODE !== "report-only" &&
      (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production");
    const cspHeaderKey = enforce
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only";

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: cspHeaderKey, value: cspDirectives },
        ],
      },
    ];
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
