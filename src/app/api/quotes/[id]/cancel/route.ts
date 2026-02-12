import { NextRequest, NextResponse } from "next/server";
import { quoteService } from "@/services/quote.service";
import { cancelQuoteSchema } from "@/lib/validations/quote.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * POST /api/quotes/[id]/cancel
 * Cancela orçamento com motivo
 *
 * Body:
 * - lostReason?: string (motivo da perda)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { id: quoteId } = await params;
    const body = await request.json();
    const data = cancelQuoteSchema.parse(body);

    const quote = await quoteService.cancel(quoteId, data, companyId) as any;

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
      message: "Orçamento cancelado com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
