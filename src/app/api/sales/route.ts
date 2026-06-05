import { NextResponse } from "next/server";
import { saleService } from "@/services/sale.service";
import {
  saleQuerySchema,
  createSaleSchema,
  sanitizeSaleDTO,
  type CreateSaleDTO,
} from "@/lib/validations/sale.schema";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";
import { auth } from "@/auth";
import { rateLimitResponse } from "@/lib/rate-limit";
import { validateBranchOwnership } from "@/lib/validate-branch";
import { requireWriteAccess } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { hashPayload } from "@/lib/idempotency";
import { withObservability } from "@/lib/observability/with-observability";

/** Serializa Decimals de uma venda (com itens e pagamentos) para number. */
function serializeSale(sale: Awaited<ReturnType<typeof saleService.create>>) {
  return {
    ...sale,
    subtotal: Number(sale.subtotal),
    discountTotal: Number(sale.discountTotal),
    total: Number(sale.total),
    agreementDiscount: sale.agreementDiscount ? Number(sale.agreementDiscount) : null,
    items: sale.items.map((item: any) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
      lineTotal: Number(item.lineTotal),
      costPrice: Number(item.costPrice),
    })),
    payments: sale.payments.map((payment: any) => ({
      ...payment,
      amount: Number(payment.amount),
    })),
    // Explícito (além do ...sale) para o PDV avisar a OS gerada.
    serviceOrder: (sale as any).serviceOrder ?? null,
  };
}

/**
 * GET /api/sales
 * Lista vendas com paginação, busca e filtros
 *
 * Query params:
 * - search: string (busca em nome do cliente, CPF, telefone)
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - status: "ativos" | "inativos" | "todos" (default: "ativos")
 * - customerId: string (filtro por cliente)
 * - startDate: string (filtro por data inicial)
 * - endDate: string (filtro por data final)
 * - paymentMethod: PaymentMethod (filtro por método de pagamento)
 * - sortBy: "createdAt" | "total" | "customer" (default: "createdAt")
 * - sortOrder: "asc" | "desc" (default: "desc")
 */
async function getHandler(request: Request): Promise<NextResponse> {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();

    // Parse e valida query params
    const { searchParams } = new URL(request.url);
    const query = saleQuerySchema.parse(Object.fromEntries(searchParams));

    // Filtro por branch (do seletor de lojas)
    const branchId = searchParams.get("branchId");
    const effectiveBranchId = branchId && branchId !== "ALL" ? branchId : null;

    // Busca vendas via service
    const result = await saleService.list(query, companyId, effectiveBranchId);

    // Serializa Decimals para number
    const serializedData = result.data.map((sale) => ({
      ...sale,
      subtotal: Number(sale.subtotal),
      discountTotal: Number(sale.discountTotal),
      total: Number(sale.total),
      agreementDiscount: sale.agreementDiscount ? Number(sale.agreementDiscount) : null,
      payments: sale.payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
    }));

    // Retorna resposta paginada com totalAmount do filtro
    return NextResponse.json({
      data: serializedData,
      pagination: result.pagination,
      totalAmount: result.totalAmount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/sales
 * Cria nova venda (PDV)
 *
 * Body: CreateSaleDTO
 * {
 *   customerId: string,
 *   branchId: string,
 *   items: [{ productId, qty, unitPrice, discount? }],
 *   payments: [{ method, amount, installments? }],
 *   discount?: number,
 *   notes?: string
 * }
 *
 * Validações:
 * - Estoque disponível para cada produto
 * - Soma de pagamentos = total da venda
 * - Pelo menos 1 item
 * - Pelo menos 1 pagamento
 */
export async function POST(request: Request) {
  try {
    // Requer autenticação
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    // Rate limit: 30 vendas por minuto por usuário
    const rlBlocked = rateLimitResponse(`sales:${session.user.id}`, { maxRequests: 30, windowMs: 60_000 });
    if (rlBlocked) return rlBlocked;

    const companyId = await getCompanyId();
    // F1/F2: assinatura inadimplente/suspensa/expirada não cria venda.
    await requireWriteAccess(companyId);
    await requirePermission("sales.create");
    const userId = session.user.id;

    // Parse e valida body
    const body = await request.json();

    // Valida com safeParse para capturar erros de validação
    const validation = createSaleSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: validation.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Q8.2.3: idempotência server-side. Se o cliente enviar Idempotency-Key e
    // repetir o POST, retornamos a venda já criada em vez de duplicar. Hash do
    // payload detecta reuso indevido da mesma key.
    // ESCOPO: cobre retry SEQUENCIAL (clique → resposta/timeout → repete), que é
    // o caso comum (retry de rede, F5 do navegador). Duplo-POST exatamente
    // SIMULTÂNEO (antes de qualquer um gravar) ainda pode escapar a checagem sem
    // lock e criar 2 vendas — esse caso é coberto pelo submitLockRef no front (H11).
    // Reforço futuro p/ blindar o servidor: advisory lock por (companyId,key)
    // como no checkout (M14) — não feito aqui p/ não segurar conexão na tx de venda.
    const idempKey = request.headers.get("idempotency-key")?.trim() || null;
    let payloadHash: string | null = null;
    if (idempKey) {
      payloadHash = hashPayload(data);
      const existingIdem = await prisma.saleIdempotency.findUnique({
        where: { companyId_key: { companyId, key: idempKey } },
      });
      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "IDEMPOTENCY_KEY_CONFLICT",
                message: "Idempotency-Key reutilizada com payload diferente.",
              },
            },
            { status: 422 },
          );
        }
        const existingSale = await saleService.getById(existingIdem.saleId, companyId);
        if (existingSale) {
          return createdResponse(serializeSale(existingSale));
        }
        // Venda referenciada sumiu (improvável): segue e recria abaixo.
      }
    }

    // Segurança multi-tenant: branchId deve pertencer à empresa do usuário
    await validateBranchOwnership(data.branchId, companyId);

    // Sanitiza dados (remove valores vazios)
    const sanitized = sanitizeSaleDTO(data) as CreateSaleDTO;

    // Cria venda via service (transação: venda + itens + pagamentos + estoque)
    const sale = await saleService.create(sanitized, companyId, userId);

    // Q8.2.3: registra a chave de idempotência (best-effort). Race de duplo POST
    // simultâneo: o @@unique(companyId,key) faz a 2ª gravação falhar (P2002) — a
    // venda já foi criada por este request, então ignoramos o erro do registro.
    if (idempKey && payloadHash) {
      await prisma.saleIdempotency
        .create({
          data: {
            companyId,
            key: idempKey,
            saleId: sale.id,
            payloadHash,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
          },
        })
        .catch(() => {});
    }

    // Retorna 201 Created
    return createdResponse(serializeSale(sale));
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withObservability("GET /api/sales", getHandler);
