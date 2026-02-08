import { BarcodeService } from "@/services/barcode.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { z } from "zod";

const barcodeService = new BarcodeService();

const searchSchema = z.object({
  code: z.string().min(1, "Código é obrigatório"),
});

/**
 * GET /api/products/search-by-barcode?code=123456789
 * Busca produto por código de barras
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const { code } = searchSchema.parse({
      code: searchParams.get("code"),
    });

    const product = await barcodeService.findProductByCode(code, companyId);

    if (!product) {
      return successResponse(null, { status: 404 });
    }

    return successResponse(product);
  } catch (error) {
    return handleApiError(error);
  }
}
