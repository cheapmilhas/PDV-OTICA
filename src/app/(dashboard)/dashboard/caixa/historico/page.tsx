"use client";

import { HistoricoCaixas } from "@/components/caixa/historico-caixas";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

function HistoricoCaixasPageContent() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/caixa"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Caixa
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Histórico de Caixas</h1>
        <p className="text-muted-foreground">
          Visualize e confira caixas de outros dias
        </p>
      </div>

      <HistoricoCaixas />
    </div>
  );
}

export default function HistoricoCaixasPage() {
  return (
    <ProtectedRoute permission="cash_shift.view">
      <HistoricoCaixasPageContent />
    </ProtectedRoute>
  );
}
