import { NextResponse } from "next/server";
import { BarcodeService } from "@/services/barcode.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const barcodeService = new BarcodeService();

/**
 * PATCH /api/products/[id]/barcodes/[barcodeId]
 * Define código como primário
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; barcodeId: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id, barcodeId } = await params;

    const barcode = await barcodeService.setPrimary(barcodeId, id, companyId);

    return successResponse(barcode);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/products/[id]/barcodes/[barcodeId]
 * Remove código de barras
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; barcodeId: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id, barcodeId } = await params;

    await barcodeService.delete(barcodeId, id, companyId);

    return successResponse({ message: "Código removido com sucesso" });
  } catch (error) {
    return handleApiError(error);
  }
}
