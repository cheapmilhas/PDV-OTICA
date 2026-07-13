import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dev-only: libera acesso ao dev server por IPs de rede local (ex.: validar
  // no celular físico no mesmo Wi-Fi). Next 16 bloqueia cross-origin em dev por
  // padrão. Faixas privadas comuns cobrem a maioria dos roteadores domésticos.
  // Não afeta produção — lá o app roda no domínio próprio.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
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
      "connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com https://api.anthropic.com https://api.asaas.com https://api-sandbox.asaas.com https://*.supabase.co https://api.focusnfe.com.br https://homologacao.focusnfe.com.br https://*.neon.tech https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
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
      {
        // Mitiga vazamento do token de reset na query string (?t=…):
        // sem referrer e sem cache no cliente/proxies.
        source: "/redefinir-senha",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
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

// Envolve com Sentry apenas se as vars de build estiverem presentes (org/project
// + auth token). Caso contrário usa nextConfig puro — evita upload de source maps
// falhar build em dev/CI sem credenciais.
const sentryReady =
  !!process.env.SENTRY_ORG &&
  !!process.env.SENTRY_PROJECT &&
  !!process.env.SENTRY_AUTH_TOKEN;

export default sentryReady
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      tunnelRoute: "/monitoring",
    })
  : nextConfig;

