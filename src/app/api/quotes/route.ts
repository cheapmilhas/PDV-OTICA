import { NextResponse } from "next/server";
import { quoteService } from "@/services/quote.service";
import { quoteQuerySchema, createQuoteSchema } from "@/lib/validations/quote.schema";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse } from "@/lib/api-response";
import { auth } from "@/auth";

/**
 * GET /api/quotes
 * Lista orçamentos com paginação, busca e filtros
 *
 * Query params:
 * - search: string (busca em nome do cliente, CPF, telefone)
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 * - status: "ativos" | "inativos" | "todos" (default: "ativos")
 * - quoteStatus: QuoteStatus (filtro por status específico)
 * - customerId: string (filtro por cliente)
 * - startDate: string (filtro por data inicial)
 * - endDate: string (filtro por data final)
 * - sortBy: "createdAt" | "total" | "customer" | "validUntil" (default: "createdAt")
 * - sortOrder: "asc" | "desc" (default: "desc")
 */
export async function GET(request: Request) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();

    // Parse e valida query params
    const { searchParams } = new URL(request.url);
    const query = quoteQuerySchema.parse(Object.fromEntries(searchParams));

    // Busca orçamentos via service
    const result = await quoteService.list(query, companyId);

    // Serializa Decimals para number
    const serializedData = result.data.map((quote: any) => ({
      ...quote,
      subtotal: Number(quote.subtotal),
      discountTotal: Number(quote.discountTotal),
      total: Number(quote.total),
      items: quote.items.map((item: any) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        total: Number(item.total),
      })),
    }));

    // Retorna resposta paginada
    return paginatedResponse(serializedData, result.pagination);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/quotes
 * Cria novo orçamento
 *
 * Body:
 * - customerId?: string (opcional - se não fornecido, usa customerName)
 * - customerName?: string (obrigatório se não tiver customerId)
 * - customerPhone?: string
 * - customerEmail?: string
 * - items: QuoteItemDTO[] (mínimo 1)
 * - discountTotal?: number
 * - discountPercent?: number
 * - notes?: string
 * - internalNotes?: string
 * - paymentConditions?: string
 * - validDays?: number (default: 15)
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const companyId = await getCompanyId();
    const userId = session.user.id;
    const branchId = await getBranchId();

    const body = await request.json();
    const data = createQuoteSchema.parse(body);

    const quote = await quoteService.create(data, companyId, userId, branchId);

    // Serializar Decimals
    const serialized = {
      ...quote,
      subtotal: Number(quote.subtotal),
      discountTotal: Number(quote.discountTotal),
      discountPercent: Number(quote.discountPercent),
      total: Number(quote.total),
      items: quote.items.map((item: any) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        total: Number(item.total),
      })),
    };

    return NextResponse.json(
      {
        success: true,
        data: serialized,
        message: "Orçamento criado com sucesso",
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
