import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { getLeadById } from "@/services/lead.service";

/**
 * POST /api/leads/[id]/convert
 * Fase 1: NÃO cria venda server-side (o motor de venda exige itens/pagamento que
 * o lead não tem). Retorna os dados de prefill para o front abrir o PDV/Quote
 * pré-preenchido. Idempotente e sem efeitos colaterais de venda.
 *
 * Se o lead já tem quoteId, o front reusa esse orçamento; senão, abre o PDV
 * pré-preenchido. A movimentação do lead para a etapa `isWon` acontece via /move.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("leads.convert");
    const companyId = await getCompanyId();
    const { id } = await params;
    const lead = await getLeadById(id, companyId);

    return successResponse({
      leadId: lead.id,
      customerId: lead.customer?.id ?? null,
      quoteId: lead.quote?.id ?? null,
      prefill: { name: lead.name, phone: lead.phone, interest: lead.interest },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
