import { NextResponse } from "next/server";
import { saleService } from "@/services/sale.service";
import {
  saleQuerySchema,
  createSaleSchema,
  sanitizeSaleDTO,
  type CreateSaleDTO,
} from "@/lib/validations/sale.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";
import { auth } from "@/auth";

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
export async function GET(request: Request) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();

    // Parse e valida query params
    const { searchParams } = new URL(request.url);
    const query = saleQuerySchema.parse(Object.fromEntries(searchParams));

    // Busca vendas via service
    const result = await saleService.list(query, companyId);

    // Serializa Decimals para number
    const serializedData = result.data.map((sale) => ({
      ...sale,
      subtotal: Number(sale.subtotal),
      discountTotal: Number(sale.discountTotal),
      total: Number(sale.total),
      agreementDiscount: sale.agreementDiscount ? Number(sale.agreementDiscount) : null,
      items: sale.items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        lineTotal: Number(item.lineTotal),
      })),
      payments: sale.payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
    }));

    // Retorna resposta paginada
    return paginatedResponse(serializedData, result.pagination);
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

    const companyId = await getCompanyId();
    const userId = session.user.id;

    // Parse e valida body
    const body = await request.json();
    const data = createSaleSchema.parse(body);

    // Sanitiza dados (remove valores vazios)
    const sanitized = sanitizeSaleDTO(data) as CreateSaleDTO;

    // Cria venda via service (transação: venda + itens + pagamentos + estoque)
    const sale = await saleService.create(sanitized, companyId, userId);

    // Serializa Decimals para number
    const serializedSale = {
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
    };

    // Retorna 201 Created
    return createdResponse(serializedSale);
  } catch (error) {
    return handleApiError(error);
  }
}
