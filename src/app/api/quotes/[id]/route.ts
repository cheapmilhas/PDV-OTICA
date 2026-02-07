import { NextRequest, NextResponse } from "next/server";
import { quoteService } from "@/services/quote.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/quotes/[id]
 * Busca orçamento por ID com todos os dados relacionados
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();

    const quoteId = params.id;

    // Busca orçamento via service
    const quote = await quoteService.getById(quoteId, companyId);

    // Serializa Decimals para number
    const serializedQuote = {
      ...quote,
      subtotal: Number(quote.subtotal),
      discountTotal: Number(quote.discountTotal),
      total: Number(quote.total),
      items: quote.items.map((item: any) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        lineTotal: Number(item.lineTotal),
        product: item.product
          ? {
              ...item.product,
              salePrice: Number(item.product.salePrice),
            }
          : null,
      })),
      convertedToSale: quote.convertedToSale
        ? {
            ...quote.convertedToSale,
            subtotal: Number(quote.convertedToSale.subtotal),
            discountTotal: Number(quote.convertedToSale.discountTotal),
            total: Number(quote.convertedToSale.total),
          }
        : null,
    };

    return NextResponse.json(serializedQuote);
  } catch (error) {
    return handleApiError(error);
  }
}
