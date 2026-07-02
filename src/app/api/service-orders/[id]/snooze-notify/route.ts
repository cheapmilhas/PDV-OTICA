import { serviceOrderService } from "@/services/service-order.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

/**
 * POST /api/service-orders/[id]/snooze-notify
 * "Ocultar por hoje" na fila "Prontos pra avisar": adia a OS até amanhã de manhã.
 * Não muda status — só some da fila até lá. Gated por empresa + permissão de OS.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("service_orders.edit");
    const companyId = await getCompanyId();
    const { id } = await params;

    const result = await serviceOrderService.snoozeNotify(id, companyId);
    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
