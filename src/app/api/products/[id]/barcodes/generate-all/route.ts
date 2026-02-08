import { BarcodeService } from "@/services/barcode.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const barcodeService = new BarcodeService();

/**
 * POST /api/products/[id]/barcodes/generate-all
 * Gera todos os tipos de código para o produto (EAN13, Code128, QRCode)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const barcodes = await barcodeService.generateAll(
      id,
      session.user.id,
      companyId
    );

    return successResponse({
      message: `${barcodes.length} código(s) gerado(s) com sucesso`,
      barcodes,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
