import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { isNewCommissionEngine } from "@/lib/commission-flag";
import { CommissionLegacyView } from "./commission-legacy-view";
import { CommissionNewView } from "./commission-new-view";

/**
 * Relatório de Comissões — escolhe a visão pelo kill-switch COMMISSION_ENGINE
 * (lido no SERVIDOR, nunca no client):
 *   - "new" (default) → tela limpa da regra nova (CommissionNewView), sem aba de
 *     preview e sem aviso de prévia. É a oficial.
 *   - "legacy" (emergência) → o relatório antigo + a aba de preview/comparação,
 *     com o lifecycle PENDENTE→APROVADA→PAGA (CommissionLegacyView).
 *
 * Trocar a env new↔legacy reverte sem deploy.
 */
export default function RelatorioComissoesPage() {
  const showNew = isNewCommissionEngine();
  return (
    <ProtectedRoute permission="reports.sales">
      {showNew ? <CommissionNewView /> : <CommissionLegacyView />}
    </ProtectedRoute>
  );
}
