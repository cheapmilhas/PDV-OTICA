import { NextResponse } from "next/server";
import { BarcodeService } from "@/services/barcode.service";
import { createBarcodeSchema } from "@/lib/validations/barcode.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse, createdResponse } from "@/lib/api-response";

const barcodeService = new BarcodeService();

/**
 * GET /api/products/[id]/barcodes
 * Lista todos os códigos de um produto
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const barcodes = await barcodeService.list(id, companyId);

    return successResponse(barcodes);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/products/[id]/barcodes
 * Cria um novo código de barras para o produto
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("products.edit");
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const data = createBarcodeSchema.parse({
      productId: id,
      ...body,
    });

    const barcode = await barcodeService.create(
      data,
      session.user.id,
      companyId
    );

    return createdResponse(barcode);
  } catch (error) {
    return handleApiError(error);
  }
}
