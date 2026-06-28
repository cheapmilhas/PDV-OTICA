import { NextResponse } from "next/server";
import { StockMovementService } from "@/services/stock-movement.service";
import {
  stockMovementQuerySchema,
  createStockMovementSchema,
  sanitizeStockMovementDTO,
  type CreateStockMovementDTO,
} from "@/lib/validations/stock-movement.schema";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { Permission } from "@/lib/permissions";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/services/activity-log.service";
import { ActorType, StockMovementType } from "@prisma/client";

const log = logger.child({ route: "stock-movements" });

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
    await requirePermission(Permission.STOCK_ADJUST);

    // Verificar se o usuário existe no banco antes de associá-lo
    let userId: string | undefined;
    if (session.user.id) {
      const userExists = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true }
      });
      userId = userExists?.id;
    }

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

    // Trilha de auditoria (decisão do dono: mínimo atrito, registrar TUDO — sem
    // aprovação nem bloqueio). Toda movimentação criada por esta rota credita/
    // ajusta estoque na hora; aqui fica o rastro de quem fez, o quê e quanto.
    // logActivity falha silenciosamente — nunca quebra a movimentação.
    const isPurchase = sanitizedData.type === StockMovementType.PURCHASE;
    await logActivity({
      companyId,
      type: "DATA_UPDATED",
      title: `Movimentação de estoque (${sanitizedData.type})`,
      detail: {
        source: "stock-movements-api",
        movementId: movement.id,
        movementType: sanitizedData.type,
        productId: sanitizedData.productId,
        productSku: movement.audit.productSku,
        productName: movement.audit.productName,
        quantity: sanitizedData.quantity,
        branchId: sanitizedData.branchId ?? null,
        supplierId: sanitizedData.supplierId ?? null,
        stockBefore: movement.audit.stockBefore,
        stockAfter: movement.audit.stockAfter,
        // PURCHASE sem fornecedor: só sinaliza (recomendado, não obrigatório).
        ...(isPurchase && !sanitizedData.supplierId ? { semFornecedor: true } : {}),
      },
      actorId: userId,
      actorType: ActorType.ADMIN,
      actorName: session.user.name ?? session.user.email ?? undefined,
    });

    // Retorna 201 Created
    return createdResponse(movement);
  } catch (error) {
    log.error("Erro ao criar movimentação de estoque", { error: error instanceof Error ? error.message : String(error) });
    return handleApiError(error);
  }
}
