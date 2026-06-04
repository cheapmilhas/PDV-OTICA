import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Preços e Planos — Sistema para Ótica a partir de R$149,90/mês",
  description:
    "Veja os planos do Vis, o sistema de gestão para óticas. A partir de R$149,90/mês. Comece grátis, sem cartão de crédito e sem fidelidade.",
  alternates: { canonical: "/precos" },
  openGraph: {
    title: "Preços do Vis — Sistema para Ótica a partir de R$149,90/mês",
    description:
      "Planos simples e sem fidelidade. Comece grátis, sem cartão de crédito.",
    url: "https://vis.app.br/precos",
  },
};

export default function PrecosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
