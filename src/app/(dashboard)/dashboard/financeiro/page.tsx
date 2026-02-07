"use client";

import { AlertCircle } from "lucide-react";

export default function FinanceiroPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[600px] gap-4">
      <AlertCircle className="h-16 w-16 text-muted-foreground" />
      <h2 className="text-2xl font-bold">Modulo Financeiro em Desenvolvimento</h2>
      <p className="text-muted-foreground text-center max-w-md">
        As funcionalidades de contas a pagar e receber estarao disponiveis em breve.
        Este modulo incluira controle completo de fluxo de caixa, contas e relatorios financeiros.
      </p>
    </div>
  );
}
