import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criar Conta",
  description:
    "Crie sua conta no PDV Ótica e comece a usar gratuitamente por 14 dias. Sem cartão de crédito.",
};

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
