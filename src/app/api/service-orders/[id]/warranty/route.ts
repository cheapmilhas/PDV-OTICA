import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceOrderService } from "@/services/service-order.service";
import { requireAuth, getCompanyId, getUserId, getBranchId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";

// Aceita o novo `type` ("warranty" | "rework" | "medical_error") OU os
// booleanos legados isWarranty/isRework (retrocompat). Deriva `type`.
const warrantySchema = z.object({
  type: z.enum(["warranty", "rework", "medical_error"]).optional(),
  isWarranty: z.boolean().optional(),
  isRework: z.boolean().optional(),
  reason: z.string().min(5, "Motivo obrigatório (mínimo 5 caracteres)").max(500),
  copyData: z.boolean().default(true),
}).transform((d) => {
  const type = d.type ?? (d.isRework ? "rework" : d.isWarranty ? "warranty" : undefined);
  return { type, reason: d.reason, copyData: d.copyData };
}).refine(
  (d) => !!d.type,
  { message: "Defina o tipo: garantia, retrabalho ou erro médico" }
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("service_orders.create");
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const branchId = await getBranchId();
    const { id } = await params;

    const body = await request.json();
    const options = warrantySchema.parse(body);

    const order = await serviceOrderService.createWarranty(
      id,
      companyId,
      userId,
      branchId,
      { type: options.type!, reason: options.reason, copyData: options.copyData }
    );

    return createdResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}
