import { NextResponse } from "next/server";
import { serviceOrderService } from "@/services/service-order.service";
import {
  updateServiceOrderSchema,
  cancelServiceOrderSchema,
  sanitizeServiceOrderDTO,
  type UpdateServiceOrderDTO,
} from "@/lib/validations/service-order.schema";
import { requireAuth, requireRole, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const order = await serviceOrderService.getById(id, companyId);

    return successResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const data = updateServiceOrderSchema.parse(body);
    const sanitized = sanitizeServiceOrderDTO(data) as UpdateServiceOrderDTO;

    const order = await serviceOrderService.update(id, sanitized, companyId);

    return successResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requireRole(["ADMIN", "GERENTE"]);
    const companyId = await getCompanyId();
    const { id } = await params;

    let reason: string | undefined;
    try {
      const body = await request.json();
      const validated = cancelServiceOrderSchema.parse(body);
      reason = validated.reason;
    } catch {
      // Body opcional
    }

    const order = await serviceOrderService.cancel(id, companyId, reason);

    return successResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}
