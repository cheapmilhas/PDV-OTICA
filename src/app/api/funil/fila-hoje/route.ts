import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { getTodayQueue } from "@/services/today-queue.service";

/**
 * GET /api/funil/fila-hoje
 * "Fila de Hoje" (Sprint 2, #4): a lista única priorizada do que a atendente
 * precisa fazer agora — atenção (reclamação) → responder → OS parada → atrasado.
 * Multi-tenant + filtro opcional por filial (?branchId). Só leitura (read-only):
 * não muda nenhum estado, apenas agrega sinais que já existem.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const result = await getTodayQueue(
      companyId,
      branchId && branchId !== "ALL" ? branchId : null,
    );
    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
