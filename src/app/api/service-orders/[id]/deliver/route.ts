import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceOrderService } from "@/services/service-order.service";
import { requireAuth, getCompanyId, getUserId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const deliverSchema = z.object({
  deliveryNotes: z.string().max(500).optional(),
  qualityRating: z.number().int().min(1).max(5).optional(),
  qualityNotes: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const { id } = await params;

    let options = {};
    try {
      const body = await request.json();
      options = deliverSchema.parse(body);
    } catch {
      // Body opcional
    }

    const order = await serviceOrderService.deliver(id, companyId, userId, options);

    return successResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}
