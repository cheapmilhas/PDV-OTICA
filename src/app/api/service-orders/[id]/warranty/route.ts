import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceOrderService } from "@/services/service-order.service";
import { requireAuth, getCompanyId, getUserId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";

const warrantySchema = z.object({
  isWarranty: z.boolean().default(false),
  isRework: z.boolean().default(false),
  reason: z.string().min(5, "Motivo obrigatório (mínimo 5 caracteres)").max(500),
  copyData: z.boolean().default(true),
}).refine(
  (d) => d.isWarranty || d.isRework,
  { message: "Defina se é garantia ou retrabalho" }
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
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
      options
    );

    return createdResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}
