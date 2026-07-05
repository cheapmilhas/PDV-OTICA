import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { SessionProvider } from "@/components/providers/session-provider";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { PostHogIdentify } from "@/components/providers/posthog-identify";
import {
  JsonLd,
  organizationJsonLd,
  buildSoftwareApplicationJsonLd,
} from "@/components/seo/json-ld";
import { getLowestActivePriceReais } from "@/lib/plan-pricing-server";
import { SITE_URL } from "@/lib/constants";

// Plus Jakarta Sans — geometric, contemporary, avoids "AI template" associations
const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Bricolage Grotesque — display face for landing H1/H2. Humanist grotesque with
// character (avoids the generic "template" feel) while staying legible in pt-BR.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2E6BFF",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Vis — Sistema de Gestão para Óticas (PDV, OS e Financeiro)",
    template: "%s | Vis",
  },
  description:
    "Vis é o sistema de gestão para óticas: PDV, ordens de serviço de lentes, estoque, financeiro e CRM num só lugar. Comece grátis, sem cartão e sem fidelidade.",
  keywords: [
    "sistema para ótica",
    "software de gestão para ótica",
    "PDV para ótica",
    "controle de estoque ótica",
    "ordem de serviço ótica",
    "sistema de vendas para ótica",
    "programa para ótica",
  ],
  applicationName: "Vis",
  authors: [{ name: "Vis" }],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Vis — Sistema de Gestão para Óticas",
    description:
      "PDV, ordens de serviço de lentes, estoque, financeiro e CRM para sua ótica num só sistema. Comece grátis.",
    url: SITE_URL,
    siteName: "Vis",
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vis — Sistema de Gestão para Óticas",
    description:
      "PDV, OS de lentes, estoque, financeiro e CRM para óticas. Comece grátis.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lowest = await getLowestActivePriceReais();
  return (
    <html lang="pt-BR">
      <head>
        <JsonLd data={organizationJsonLd} />
        <JsonLd data={buildSoftwareApplicationJsonLd(lowest)} />
      </head>
      <body className={`${jakartaSans.variable} ${bricolage.variable} font-sans`}>
        <Suspense fallback={null}>
          <PostHogProvider>
            <SessionProvider>
              <PostHogIdentify />
              {children}
            </SessionProvider>
          </PostHogProvider>
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
