import { NextResponse } from "next/server";
import { saleService } from "@/services/sale.service";
import { cancelSaleSchema } from "@/lib/validations/sale.schema";
import { requireAuth, requireRole, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";

/**
 * GET /api/sales/[id]
 * Busca venda por ID com todos os dados (itens, pagamentos, cliente, etc)
 *
 * Retorna: Sale com includes
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    // Busca venda
    const sale = await saleService.getById(id, companyId);

    return successResponse(sale);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/sales/[id]
 * Cancela venda (soft delete) e estorna estoque
 *
 * RBAC: Requer permissão SALES_CANCEL (apenas ADMIN e MANAGER)
 *
 * Body (opcional):
 * {
 *   reason?: string
 * }
 *
 * Ações:
 * - Marca venda como inativa (active = false)
 * - Estorna estoque de todos os itens
 * - Marca pagamentos como cancelados
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requer permissão para cancelar vendas
    await requirePermission(Permission.SALES_CANCEL);
    const companyId = await getCompanyId();
    const { id } = await params;

    // Parse body opcional (reason)
    let reason: string | undefined;
    try {
      const body = await request.json();
      const validated = cancelSaleSchema.parse(body);
      reason = validated.reason;
    } catch {
      // Body opcional, ignora erro de parse
    }

    // Cancela venda (soft delete + estorno estoque)
    const sale = await saleService.cancel(id, companyId, reason);

    return successResponse(sale);
  } catch (error) {
    return handleApiError(error);
  }
}
