import { NextResponse } from "next/server";
import { quoteService } from "@/services/quote.service";
import { quoteQuerySchema } from "@/lib/validations/quote.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse } from "@/lib/api-response";

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
        lineTotal: Number(item.lineTotal),
      })),
    }));

    // Retorna resposta paginada
    return paginatedResponse(serializedData, result.pagination);
  } catch (error) {
    return handleApiError(error);
  }
}
