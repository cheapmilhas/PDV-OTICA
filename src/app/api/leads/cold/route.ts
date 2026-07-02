import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { listColdLeads } from "@/services/cold-leads.service";
import { LEAD_STATS_PERIODS, periodToRange, type LeadStatsPeriod } from "@/lib/lead-stats-period";

/**
 * GET /api/leads/cold
 * "Recuperar" (Sprint 3, #7): leads que NÃO converteram (sem venda vinculada,
 * não-ganhos, perdidos OU parados há dias) — a lista pra puxar de volta com
 * promoção. Read-only. Multi-tenant + filial opcional (?branchId) + filtros
 * ?source, ?lostReason e ?period (reusa o preset do placar; janela server-side).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const params = new URL(request.url).searchParams;
    const branchId = params.get("branchId");
    const source = params.get("source");
    const lostReasonCategory = params.get("lostReasonCategory");
    // Recuperação olha o BACKLOG inteiro por padrão: um lead perdido meses atrás
    // ainda vale resgate. Só recorta por período quando vem um preset VÁLIDO e
    // explícito; ausente OU malformado (?period=xyz) = sem borda (backlog inteiro).
    // Não passa por parseLeadStatsPeriod de propósito: ele coage lixo p/ "30d",
    // o que esconderia os frios antigos — o oposto do que esta lista quer.
    const rawPeriod = params.get("period");
    const validPeriod = LEAD_STATS_PERIODS.find((p) => p.value === rawPeriod)?.value as
      | LeadStatsPeriod
      | undefined;
    const range = validPeriod ? periodToRange(validPeriod) : {};

    const rows = await listColdLeads(
      companyId,
      branchId && branchId !== "ALL" ? branchId : null,
      {
        source: source || undefined,
        lostReasonCategory: lostReasonCategory || undefined,
        from: range.from,
      },
    );
    return successResponse({ rows, total: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}
