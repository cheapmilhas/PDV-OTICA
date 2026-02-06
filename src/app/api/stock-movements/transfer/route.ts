import { NextResponse } from "next/server";
import { StockMovementService } from "@/services/stock-movement.service";
import {
  createTransferSchema,
  type CreateTransferDTO,
} from "@/lib/validations/stock-movement.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";

const stockMovementService = new StockMovementService();

/**
 * POST /api/stock-movements/transfer
 * Cria transferência entre filiais
 *
 * Cria duas movimentações automaticamente:
 * - TRANSFER_OUT na filial de origem (reduz estoque)
 * - TRANSFER_IN na filial de destino
 *
 * Body: CreateTransferDTO
 */
export async function POST(request: Request) {
  try {
    // Requer autenticação
    const session = await requireAuth();
    const companyId = await getCompanyId();
    const userId = session.user.id;

    // Parse e valida body
    const body = await request.json();
    const data = createTransferSchema.parse(body);

    // Cria transferência via service
    const result = await stockMovementService.createTransfer(
      data,
      companyId,
      userId
    );

    // Retorna 201 Created com as duas movimentações
    return createdResponse(result);
  } catch (error) {
    console.error("Erro ao criar transferência:", error);
    return handleApiError(error);
  }
}
