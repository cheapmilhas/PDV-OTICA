import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criar conta — Vis Medical",
  description:
    "Teste grátis o Vis Medical: prontuário eletrônico, agenda e financeiro para clínicas e consultórios. Sem cartão de crédito.",
};

export default function RegistroMedicalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
