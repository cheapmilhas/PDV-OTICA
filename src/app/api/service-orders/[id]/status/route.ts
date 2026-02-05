import { NextResponse } from "next/server";
import { serviceOrderService } from "@/services/service-order.service";
import { updateStatusSchema } from "@/lib/validations/service-order.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

/**
 * PATCH /api/service-orders/[id]/status
 * Atualiza status da ordem de serviço
 *
 * Body: { status: ServiceOrderStatus, notes?: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const { status, notes } = updateStatusSchema.parse(body);

    const order = await serviceOrderService.updateStatus(id, status, companyId, notes);

    return successResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}
