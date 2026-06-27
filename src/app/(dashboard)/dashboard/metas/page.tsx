import { isNewCommissionEngine } from "@/lib/commission-flag";
import { MetasContent } from "./metas-content";

/**
 * Tela de Metas — escolhe o que exibir pelo kill-switch COMMISSION_ENGINE,
 * lido no SERVIDOR (nunca no client; mesmo padrão de /relatorios/comissoes):
 *   - "new"    → esconde a comissão do cálculo legado (card "Comissões Totais",
 *     aba "Comissões" e "Fechar Mês"). A comissão passa a viver só em
 *     Relatórios → Comissões. Restam Ranking + cards de vendas/metas.
 *   - "legacy" → tela idêntica a hoje (comissão visível e operável).
 *
 * `showCommission = isLegacyCommissionEngine()`. A flag é GLOBAL (não por-ótica)
 * e fail-safe legacy. Esconder a UI não basta — o backend recusa as gravações
 * de comissão em modo new (POST/PUT /api/goals/commissions).
 */
export default function GoalsPage() {
  const showCommission = !isNewCommissionEngine();
  return <MetasContent showCommission={showCommission} />;
}
