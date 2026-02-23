import { NextRequest, NextResponse } from "next/server";
import { quoteService } from "@/services/quote.service";
import { convertQuoteToSaleSchema } from "@/lib/validations/quote.schema";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";
import { auth } from "@/auth";

/**
 * POST /api/quotes/[id]/convert
 * Converte orçamento aprovado em venda (B1)
 *
 * Body: ConvertQuoteToSaleDTO
 * {
 *   payments: [{ method, amount, installments? }]
 * }
 *
 * Validações:
 * - Orçamento deve estar APPROVED
 * - Orçamento não pode estar expirado (validUntil >= hoje)
 * - Deve haver caixa aberto
 * - Estoque disponível para todos os itens
 * - Soma de pagamentos = total do orçamento
 *
 * Ações em transação:
 * - Cria Sale + SaleItems
 * - Cria SalePayments
 * - Decrementa estoque
 * - Cria CashMovements (para CASH)
 * - Cria Commission
 * - Atualiza Quote.status → CONVERTED
 * - Define links bidirecionais Quote ↔ Sale
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requer autenticação
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const { id } = await params;
    const companyId = await getCompanyId();
    await requirePermission("quotes.convert");
    const userId = session.user.id;

    // Validar branchId (obrigatório para criar venda)
    if (!session.user.branchId) {
      return NextResponse.json(
        { error: "Usuário deve estar vinculado a uma filial" },
        { status: 400 }
      );
    }

    const branchId = session.user.branchId;
    const quoteId = id;

    // Parse e valida body
    const body = await request.json();
    const { payments } = convertQuoteToSaleSchema.parse(body);

    // Converte orçamento em venda via service
    const result = await quoteService.convertToSale(
      quoteId,
      companyId,
      branchId,
      userId,
      payments
    );

    // Serializa Decimals para number
    const serializedResult = {
      sale: result.sale ? {
        ...result.sale,
        subtotal: Number(result.sale.subtotal),
        discountTotal: Number(result.sale.discountTotal),
        total: Number(result.sale.total),
        agreementDiscount: result.sale.agreementDiscount
          ? Number(result.sale.agreementDiscount)
          : null,
        items: result.sale.items.map((item: any) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
          lineTotal: Number(item.lineTotal || item.total),
        })),
        payments: result.sale.payments.map((payment: any) => ({
          ...payment,
          amount: Number(payment.amount),
        })),
      } : null,
      quote: {
        ...result.quote,
        subtotal: Number(result.quote.subtotal),
        discountTotal: Number(result.quote.discountTotal),
        total: Number(result.quote.total),
        items: result.quote.items.map((item: any) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
          lineTotal: Number(item.lineTotal || item.total),
        })),
      },
    };

    // Retorna 201 Created
    return createdResponse(serializedResult);
  } catch (error) {
    return handleApiError(error);
  }
}
