import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criar Conta",
  description:
    "Crie sua conta no Vis e comece a usar grátis. Sem cartão de crédito e sem fidelidade.",
};

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
