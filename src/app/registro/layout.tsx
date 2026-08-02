import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criar Conta",
  description:
    "Crie sua conta no Vis e comece a usar grátis. Sem cartão de crédito e sem fidelidade.",
  // O sitemap.ts declara /registro com priority 0.9, mas sem canonical próprio
  // a página herdava o "/" do RootLayout — pedia indexação e se declarava
  // duplicata da home ao mesmo tempo, na principal página de conversão.
  alternates: { canonical: "/registro" },
};

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
