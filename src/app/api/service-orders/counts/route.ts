import { serviceOrderService } from "@/services/service-order.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

/**
 * GET /api/service-orders/counts
 * Contadores leves para badges (hoje: fila "Prontos pra avisar"). Separado da
 * listagem para o badge poder buscar só o número sem carregar as linhas.
 * Respeita a filial selecionada (?branchId).
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const branchId = new URL(request.url).searchParams.get("branchId");
    const effectiveBranchId = branchId && branchId !== "ALL" ? branchId : null;

    const prontosAvisar = await serviceOrderService.countProntosAvisar(companyId, effectiveBranchId);
    return successResponse({ prontosAvisar });
  } catch (error) {
    return handleApiError(error);
  }
}
