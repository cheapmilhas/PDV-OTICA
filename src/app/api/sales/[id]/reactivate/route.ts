import { NextResponse } from "next/server";
import { saleService } from "@/services/sale.service";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { Permission } from "@/lib/permissions";
import { auth } from "@/auth";

/**
 * POST /api/sales/[id]/reactivate
 * Reativa venda cancelada (estorna cancelamento)
 *
 * RBAC: Requer permissão SALES_CANCEL (apenas ADMIN e MANAGER)
 *
 * Ações:
 * - Valida que a venda está cancelada
 * - Verifica estoque disponível
 * - Verifica caixa aberto
 * - Reativa venda (status = COMPLETED)
 * - Decrementa estoque novamente
 * - Cria movimentos de caixa
 * - Reativa comissões
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requer permissão para cancelar/reativar vendas
    await requirePermission(Permission.SALES_CANCEL);
    const session = await auth();
    const companyId = await getCompanyId();
    const userId = session?.user?.id!;
    const { id } = await params;

    // Reativa venda
    const sale = await saleService.reactivate(id, companyId, userId);

    return successResponse(sale);
  } catch (error) {
    return handleApiError(error);
  }
}
