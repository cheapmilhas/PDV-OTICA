import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/constants";

// A página tem as DUAS abas (ótica e clínica), então o metadado soma os dois
// mundos em vez de anunciar só o ótico. Os termos e o preço óticos ficam — são
// os que já ranqueiam — e os de clínica entram ao lado.
export const metadata: Metadata = {
  title: "Preços e Planos do Vis — para óticas e clínicas",
  description:
    "Veja os planos do Vis: sistema para óticas a partir de R$149,90/mês e para clínicas e consultórios a partir de R$89,90/mês. Comece grátis, sem cartão e sem fidelidade.",
  alternates: { canonical: "/precos" },
  openGraph: {
    title: "Preços do Vis — planos para óticas e clínicas",
    description:
      "Planos simples e sem fidelidade. Comece grátis, sem cartão de crédito.",
    url: "https://vis.app.br/precos",
    images: [OG_IMAGE],
  },
};

export default function PrecosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
