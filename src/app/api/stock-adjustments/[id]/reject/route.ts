import { NextResponse } from "next/server";
import { StockAdjustmentService } from "@/services/stock-adjustment.service";
import { rejectStockAdjustmentSchema } from "@/lib/validations/stock-adjustment.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const stockAdjustmentService = new StockAdjustmentService();

/**
 * POST /api/stock-adjustments/[id]/reject
 * Rejeita um ajuste de estoque
 *
 * Requer permissão: STOCK_ADJUSTMENT_APPROVE (ADMIN ou MANAGER)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(Permission.STOCK_ADJUSTMENT_APPROVE);
    const session = await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const { rejectionReason } = rejectStockAdjustmentSchema.parse({
      adjustmentId: id,
      ...body,
    });

    const adjustment = await stockAdjustmentService.reject(
      id,
      session.user.id,
      rejectionReason,
      companyId
    );

    return successResponse(adjustment);
  } catch (error) {
    return handleApiError(error);
  }
}
