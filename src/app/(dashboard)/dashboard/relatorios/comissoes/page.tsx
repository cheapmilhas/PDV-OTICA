import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { isNewCommissionEngine } from "@/lib/commission-flag";
import { getCompanyId } from "@/lib/auth-helpers";
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
 * A decisão é POR ÓTICA (companyId, lido no servidor). Trocar a env reverte sem deploy.
 */
export default async function RelatorioComissoesPage() {
  const companyId = await getCompanyId();
  const showNew = isNewCommissionEngine(companyId);
  return (
    <ProtectedRoute permission="reports.sales">
      {showNew ? <CommissionNewView /> : <CommissionLegacyView />}
    </ProtectedRoute>
  );
}
