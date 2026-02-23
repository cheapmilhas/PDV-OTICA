import { NextResponse } from "next/server";
import { StockAdjustmentService } from "@/services/stock-adjustment.service";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const stockAdjustmentService = new StockAdjustmentService();

/**
 * GET /api/stock-adjustments/[id]
 * Busca ajuste por ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const adjustment = await stockAdjustmentService.getById(id, companyId);

    return successResponse(adjustment);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/stock-adjustments/[id]
 * Cancela ajuste (apenas se PENDING)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("stock.adjust");
    const { id } = await params;

    // Busca ajuste
    const adjustment = await stockAdjustmentService.getById(id, companyId);

    // Só permite deletar se PENDING
    if (adjustment.status !== "PENDING") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_STATUS",
            message: "Apenas ajustes pendentes podem ser cancelados",
          },
        },
        { status: 400 }
      );
    }

    // Rejeita o ajuste
    await stockAdjustmentService.reject(
      id,
      session.user.id,
      "Cancelado pelo usuário",
      companyId
    );

    return successResponse({ message: "Ajuste cancelado com sucesso" });
  } catch (error) {
    return handleApiError(error);
  }
}
