import { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { hasPermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { EditorRegras } from "@/components/configuracoes/editor-regras";
import { Settings } from "lucide-react";

export const metadata: Metadata = {
  title: "Regras do Sistema | PDV Ótica",
  description: "Configure regras de negócio e permissões do sistema",
};

export default async function RegrasPage() {
  await requireAuth();

  // Apenas ADMIN pode acessar esta página
  const canManageSettings = await hasPermission(Permission.SETTINGS_MANAGE);

  if (!canManageSettings) {
    redirect("/dashboard");
  }

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
        <h3 className="font-semibold text-blue-900">💡 Sobre as Regras</h3>
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
