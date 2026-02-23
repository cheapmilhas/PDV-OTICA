import { NextResponse } from "next/server";
import { StockAdjustmentService } from "@/services/stock-adjustment.service";
import {
  createStockAdjustmentSchema,
  stockAdjustmentQuerySchema,
  sanitizeStockAdjustmentDTO,
} from "@/lib/validations/stock-adjustment.schema";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";

const stockAdjustmentService = new StockAdjustmentService();

/**
 * GET /api/stock-adjustments
 * Lista ajustes de estoque com paginação e filtros
 */
export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const query = stockAdjustmentQuerySchema.parse(
      Object.fromEntries(searchParams)
    );

    const result = await stockAdjustmentService.list(query, companyId);

    const pagination = {
      ...result.meta,
      hasNext: result.meta.page < result.meta.totalPages,
      hasPrevious: result.meta.page > 1,
    };

    return paginatedResponse(result.data, pagination);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/stock-adjustments
 * Cria novo ajuste de estoque
 */
export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("stock.adjust");

    const body = await request.json();
    const data = createStockAdjustmentSchema.parse(body);
    const sanitizedData = sanitizeStockAdjustmentDTO(data);

    const adjustment = await stockAdjustmentService.create(
      sanitizedData,
      companyId,
      session.user.id
    );

    return createdResponse(adjustment);
  } catch (error) {
    return handleApiError(error);
  }
}
