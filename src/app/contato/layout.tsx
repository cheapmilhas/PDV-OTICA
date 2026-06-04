import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fale com a Vis — Demonstração e Suporte do Sistema para Ótica",
  description:
    "Tire dúvidas, peça uma demonstração ou fale com o suporte do Vis, o sistema de gestão para óticas. Resposta rápida por WhatsApp e e-mail.",
  alternates: { canonical: "/contato" },
  openGraph: {
    title: "Fale com a Vis",
    description: "Demonstração e suporte do sistema de gestão para óticas Vis.",
    url: "https://vis.app.br/contato",
  },
};

export default function ContatoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
