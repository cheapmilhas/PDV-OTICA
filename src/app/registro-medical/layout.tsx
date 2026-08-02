import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criar conta — Vis Medical",
  description:
    "Teste grátis o Vis Medical: prontuário eletrônico, agenda e financeiro para clínicas e consultórios. Sem cartão de crédito.",
  // Mesmo motivo do /registro: sem isto herdava o canonical "/" da home.
  alternates: { canonical: "/registro-medical" },
};

export default function RegistroMedicalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
