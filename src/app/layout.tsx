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
import { SITE_URL, SITE_DESCRIPTION } from "@/lib/constants";

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
  // "Óticas" permanece PRIMEIRO e literal no título: é o termo que já ranqueia e
  // que traz a receita atual. O segundo segmento foi ACRESCENTADO, não substituído
  // — mexer em título é a alavanca de SEO mais sensível que existe, e somar é
  // muito menos arriscado que trocar.
  title: {
    default: "Vis — Sistemas de gestão para óticas e clínicas",
    template: "%s | Vis",
  },
  // Fonte única, em @/lib/constants. Antes havia uma string hardcoded AQUI e outra
  // (órfã) no constants: a duplicação escondeu o fato de que o site foi
  // reposicionado para dois produtos e o metadado continuou só de ótica.
  description: SITE_DESCRIPTION,
  // As 7 keywords de ótica ficam INTACTAS; as de clínica entram somando. Keyword é
  // lista, não disputa — acrescentar não custa posição.
  keywords: [
    "sistema para ótica",
    "software de gestão para ótica",
    "PDV para ótica",
    "controle de estoque ótica",
    "ordem de serviço ótica",
    "sistema de vendas para ótica",
    "programa para ótica",
    "sistema para clínica",
    "prontuário eletrônico",
    "software para consultório",
    "agenda médica",
    "sistema para consultório médico",
  ],
  applicationName: "Vis",
  authors: [{ name: "Vis" }],
  alternates: { canonical: "/" },
  // OG/Twitter geram o card de compartilhamento (WhatsApp, LinkedIn). Diziam
  // "Sistema de Gestão para Óticas": compartilhar a /medical num grupo de médicos
  // produzia um card de ótica — o oposto do que a página vende.
  openGraph: {
    title: "Vis — Sistemas de gestão para óticas e clínicas",
    description:
      "Dois sistemas: um para óticas (PDV, ordens de serviço de lentes, estoque e financeiro) e outro para clínicas e consultórios (prontuário, agenda e receituário). Comece grátis.",
    url: SITE_URL,
    siteName: "Vis",
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vis — Sistemas de gestão para óticas e clínicas",
    description:
      "PDV e OS de lentes para óticas; prontuário, agenda e receituário para clínicas. Comece grátis.",
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
