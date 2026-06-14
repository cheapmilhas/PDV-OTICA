import { NextRequest } from "next/server";
import { saleService } from "@/services/sale.service";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("sales.view");
    const companyId = await getCompanyId();
    const { id } = await params;

    const trace = await saleService.getCashTrace(id, companyId);
    return successResponse({ trace });
  } catch (error) {
    return handleApiError(error);
  }
}
