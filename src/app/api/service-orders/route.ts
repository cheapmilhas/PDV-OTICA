import { NextResponse } from "next/server";
import { serviceOrderService } from "@/services/service-order.service";
import {
  serviceOrderQuerySchema,
  createServiceOrderSchema,
  sanitizeServiceOrderDTO,
  type CreateServiceOrderDTO,
} from "@/lib/validations/service-order.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse } from "@/lib/api-response";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const query = serviceOrderQuerySchema.parse(Object.fromEntries(searchParams));

    const result = await serviceOrderService.list(query, companyId);

    return paginatedResponse(result.data, result.pagination);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json();
    const data = createServiceOrderSchema.parse(body);
    const sanitized = sanitizeServiceOrderDTO(data) as CreateServiceOrderDTO;

    const order = await serviceOrderService.create(sanitized, companyId);

    return createdResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}
