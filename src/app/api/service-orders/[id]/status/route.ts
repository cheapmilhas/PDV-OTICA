import { serviceOrderService } from "@/services/service-order.service";
import { updateStatusSchema } from "@/lib/validations/service-order.schema";
import { requireAuth, getCompanyId, getUserId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("service_orders.edit");
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const { id } = await params;

    const body = await request.json();
    const { status, notes } = updateStatusSchema.parse(body);

    const order = await serviceOrderService.updateStatus(id, status, companyId, userId, notes);

    return successResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}
