import { NextResponse } from "next/server";
import { StockAdjustmentService } from "@/services/stock-adjustment.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const stockAdjustmentService = new StockAdjustmentService();

/**
 * POST /api/stock-adjustments/[id]/approve
 * Aprova um ajuste de estoque
 *
 * Requer permissão: STOCK_ADJUSTMENT_APPROVE (ADMIN ou MANAGER)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requer permissão de aprovação
    await requirePermission(Permission.STOCK_ADJUSTMENT_APPROVE);
    const session = await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const adjustment = await stockAdjustmentService.approve(
      id,
      session.user.id,
      companyId
    );

    return successResponse(adjustment);
  } catch (error) {
    return handleApiError(error);
  }
}
