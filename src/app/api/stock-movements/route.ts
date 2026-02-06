import { NextResponse } from "next/server";
import { StockMovementService } from "@/services/stock-movement.service";
import {
  stockMovementQuerySchema,
  createStockMovementSchema,
  sanitizeStockMovementDTO,
  type CreateStockMovementDTO,
} from "@/lib/validations/stock-movement.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";

const stockMovementService = new StockMovementService();

/**
 * GET /api/stock-movements
 * Lista movimentações de estoque com paginação e filtros
 *
 * Query params:
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - type: StockMovementType (filtro por tipo)
 * - productId: string (filtro por produto)
 * - supplierId: string (filtro por fornecedor)
 * - sourceBranchId: string (filtro por filial origem)
 * - targetBranchId: string (filtro por filial destino)
 * - startDate: string (ISO datetime - início do período)
 * - endDate: string (ISO datetime - fim do período)
 * - sortBy: "createdAt" | "type" | "quantity" (default: "createdAt")
 * - sortOrder: "asc" | "desc" (default: "desc")
 */
export async function GET(request: Request) {
  try {
    // Requer autenticação
    const session = await requireAuth();
    const companyId = await getCompanyId();

    // Parse e valida query params
    const { searchParams } = new URL(request.url);
    const query = stockMovementQuerySchema.parse(Object.fromEntries(searchParams));

    // Busca movimentações via service
    const result = await stockMovementService.list(query, companyId);

    // Retorna resposta paginada
    return paginatedResponse(result.data, result.meta);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/stock-movements
 * Cria nova movimentação de estoque (entrada ou saída)
 *
 * Body: CreateStockMovementDTO
 */
export async function POST(request: Request) {
  try {
    // Requer autenticação
    const session = await requireAuth();
    const companyId = await getCompanyId();
    const userId = session.user.id;

    // Parse e valida body
    const body = await request.json();
    const data = createStockMovementSchema.parse(body);

    // Sanitiza dados (remove strings vazias)
    const sanitizedData = sanitizeStockMovementDTO(data) as CreateStockMovementDTO;

    // Cria movimentação via service
    const movement = await stockMovementService.create(
      sanitizedData,
      companyId,
      userId
    );

    // Retorna 201 Created
    return createdResponse(movement);
  } catch (error) {
    console.error("Erro ao criar movimentação de estoque:", error);
    return handleApiError(error);
  }
}
