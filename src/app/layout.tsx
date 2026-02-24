import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SessionProvider } from "@/components/providers/session-provider";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "PDV Ótica — Sistema de Gestão para Óticas",
    template: "%s | PDV Ótica",
  },
  description:
    "Sistema completo para gestão de óticas: PDV, estoque, financeiro, CRM, relatórios e muito mais. Teste grátis por 14 dias.",
  keywords: [
    "sistema para ótica",
    "PDV ótica",
    "gestão de ótica",
    "software para ótica",
    "sistema de vendas para ótica",
    "controle de estoque ótica",
    "ponto de venda ótica",
  ],
  openGraph: {
    title: "PDV Ótica — Sistema de Gestão para Óticas",
    description:
      "Sistema completo para gestão de óticas. PDV, estoque, financeiro, CRM e muito mais. Teste grátis por 14 dias.",
    url: "https://pdv-otica.vercel.app",
    siteName: "PDV Ótica",
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "PDV Ótica — Sistema de Gestão para Óticas",
    description:
      "Sistema completo para gestão de óticas. Teste grátis por 14 dias.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "PDV Ótica",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              offers: {
                "@type": "AggregateOffer",
                lowPrice: "149.90",
                highPrice: "499.90",
                priceCurrency: "BRL",
              },
              description:
                "Sistema completo de gestão para óticas — PDV, estoque, financeiro, CRM e muito mais.",
            }),
          }}
        />
      </head>
      <body className={inter.className}>
        <SessionProvider>{children}</SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
