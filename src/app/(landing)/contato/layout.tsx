import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/constants";

// Esta página é o destino do "Deixar meu contato" da home institucional, que
// serve os DOIS produtos — o metadado não pode anunciar só ótica.
export const metadata: Metadata = {
  title: "Fale com a Vis — Demonstração e Suporte",
  description:
    "Tire dúvidas, peça uma demonstração ou fale com o suporte do Vis: sistema de gestão para óticas e para clínicas e consultórios. Resposta rápida por e-mail.",
  alternates: { canonical: "/contato" },
  openGraph: {
    title: "Fale com a Vis",
    description:
      "Demonstração e suporte dos sistemas Vis para óticas e para clínicas.",
    url: "https://vis.app.br/contato",
    images: [OG_IMAGE],
  },
};

export default function ContatoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
