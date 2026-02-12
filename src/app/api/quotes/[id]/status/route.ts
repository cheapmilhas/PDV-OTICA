import { NextRequest, NextResponse } from "next/server";
import { quoteService } from "@/services/quote.service";
import { updateQuoteStatusSchema } from "@/lib/validations/quote.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * PATCH /api/quotes/[id]/status
 * Atualiza status do orçamento
 *
 * Body:
 * - status: QuoteStatus
 * - lostReason?: string (obrigatório se status = CANCELLED)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { id: quoteId } = await params;
    const body = await request.json();
    const { status, lostReason } = updateQuoteStatusSchema.parse(body);

    const quote = await quoteService.updateStatus(
      quoteId,
      status,
      companyId,
      lostReason
    ) as any;

    // Serializar
    const serialized = {
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
    };

    return NextResponse.json({
      success: true,
      data: serialized,
      message: `Status atualizado para ${status}`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
