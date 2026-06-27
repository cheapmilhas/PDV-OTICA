import { isNewCommissionEngine } from "@/lib/commission-flag";
import { getCompanyId } from "@/lib/auth-helpers";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { MetasTabs } from "./metas-tabs";

type TabKey = "ranking" | "comissoes" | "config";
const VALID: TabKey[] = ["ranking", "comissoes", "config"];

/**
 * Página única de Metas — 3 abas (Ranking · Comissões · Config).
 * Server: resolve o modo new/legacy por ótica (kill-switch) e a aba inicial (?tab=);
 * o gating de goals é por-aba (RankingTab). Guard de página = qualquer uma das 3
 * permissões (quem tem só Comissões ou só Config também entra).
 */
export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const companyId = await getCompanyId();
  const mode = isNewCommissionEngine(companyId) ? "new" : "legacy";
  const { tab } = await searchParams;
  const initialTab: TabKey = VALID.includes(tab as TabKey) ? (tab as TabKey) : "ranking";

  return (
    <ProtectedRoute
      permission={["goals.view", "reports.sales", "settings.edit"]}
      requireAny
    >
      <MetasTabs mode={mode} initialTab={initialTab} />
    </ProtectedRoute>
  );
}
