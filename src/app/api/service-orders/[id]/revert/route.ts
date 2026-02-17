import { NextResponse } from "next/server";
import { z } from "zod";
import { ServiceOrderStatus } from "@prisma/client";
import { serviceOrderService } from "@/services/service-order.service";
import { requireAuth, requireRole, getCompanyId, getUserId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const revertSchema = z.object({
  targetStatus: z.nativeEnum(ServiceOrderStatus),
  reason: z.string().min(5, "Motivo obrigatório (mínimo 5 caracteres)").max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    // Reversão requer ADMIN ou GERENTE
    await requireRole(["ADMIN", "GERENTE"]);
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const { id } = await params;

    const body = await request.json();
    const { targetStatus, reason } = revertSchema.parse(body);

    const order = await serviceOrderService.revert(id, companyId, userId, targetStatus, reason);

    return successResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}
