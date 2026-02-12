import { NextRequest, NextResponse } from "next/server";
import { quoteService } from "@/services/quote.service";
import { updateQuoteSchema } from "@/lib/validations/quote.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/quotes/[id]
 * Busca orçamento por ID com todos os dados relacionados
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requer autenticação
    await requireAuth();
    const companyId = await getCompanyId();

    const { id: quoteId } = await params;

    // Busca orçamento via service
    const quote = await quoteService.getById(quoteId, companyId) as any;

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
        total: Number(item.total),
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

/**
 * PUT /api/quotes/[id]
 * Atualiza orçamento existente
 *
 * Body: Partial<CreateQuoteDTO>
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { id: quoteId } = await params;
    const body = await request.json();
    const data = updateQuoteSchema.parse(body);

    const quote = await quoteService.update(quoteId, data, companyId) as any;

    // Serializar
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

    return NextResponse.json({
      success: true,
      data: serialized,
      message: "Orçamento atualizado com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/quotes/[id]
 * Cancela orçamento (soft delete via status)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { id: quoteId } = await params;

    const quote = await quoteService.cancel(quoteId, {}, companyId) as any;

    const serialized = {
      ...quote,
      subtotal: Number(quote.subtotal),
      discountTotal: Number(quote.discountTotal),
      total: Number(quote.total),
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
