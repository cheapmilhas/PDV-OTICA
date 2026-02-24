import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Preços",
  description:
    "Conheça os planos do PDV Ótica. Teste grátis por 14 dias, sem cartão de crédito.",
};

export default function PrecosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
