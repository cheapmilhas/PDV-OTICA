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
    // Content-Security-Policy em report-only por padrão (não bloqueia, só reporta).
    // Para ativar enforce: trocar "Content-Security-Policy-Report-Only" por
    // "Content-Security-Policy" após validar logs por alguns dias.
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

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
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
