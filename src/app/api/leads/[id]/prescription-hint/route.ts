import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { getLeadPrescriptionHint } from "@/services/lead.service";

/**
 * GET /api/leads/[id]/prescription-hint
 * Gancho de "2ª via de receita": última receita (grau) do cliente vinculado ao
 * lead. Carregado SOB DEMANDA (não engorda o funil). Multi-tenant nos 2 níveis
 * (lead + receita por companyId). Exige acesso ao Livro de Receitas (LGPD: grau
 * é dado clínico — não basta leads.access).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    await requirePermission("prescriptions.view");
    const companyId = await getCompanyId();
    const { id } = await params;
    const hint = await getLeadPrescriptionHint(id, companyId);
    return successResponse(hint);
  } catch (error) {
    return handleApiError(error);
  }
}
