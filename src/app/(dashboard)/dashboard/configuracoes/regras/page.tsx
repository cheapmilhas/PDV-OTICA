"use client";

import { EditorRegras } from "@/components/configuracoes/editor-regras";
import { Settings } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

function RegrasPageContent() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Regras do Sistema</h1>
          <p className="text-muted-foreground">
            Configure limites, permissões e comportamentos do sistema
          </p>
        </div>
      </div>

      <EditorRegras />

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-blue-900">Sobre as Regras</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>
            <strong>Estoque:</strong> Controle limites de aprovação de ajustes, estoque mínimo, alertas de ruptura
          </li>
          <li>
            <strong>Vendas:</strong> Defina descontos máximos por cargo, permissão para editar vendas finalizadas
          </li>
          <li>
            <strong>Financeiro:</strong> Configure limites de crédito, juros de parcelamento, taxas
          </li>
          <li>
            <strong>Produtos:</strong> Margem de lucro mínima, markup padrão, validações de preço
          </li>
          <li>
            <strong>Clientes:</strong> Limite de crédito padrão, dias para primeira compra, validações de cadastro
          </li>
          <li>
            <strong>Relatórios:</strong> Período máximo de consulta, agendamento de relatórios
          </li>
        </ul>
        <p className="text-sm text-blue-700 pt-2">
          <strong>Importante:</strong> Alterações nas regras afetam o comportamento do sistema imediatamente.
          Certifique-se de salvar cada regra após editá-la.
        </p>
      </div>
    </div>
  );
}

export default function RegrasPage() {
  return (
    <ProtectedRoute permission="settings.edit">
      <RegrasPageContent />
    </ProtectedRoute>
  );
}
