import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { prescriptionService } from "@/services/prescription.service";
import { prescriptionSchema, prescriptionQuerySchema } from "@/lib/validations/prescription.schema";

// GET - Listar receitas
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const query = prescriptionQuerySchema.parse({
      customerId: searchParams.get("customerId") || undefined,
      page: searchParams.get("page") || 1,
      pageSize: searchParams.get("pageSize") || 10,
    });

    const result = await prescriptionService.list(
      companyId,
      query.page,
      query.pageSize,
      query.customerId
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - Criar receita
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("service_orders.create");
    const companyId = await getCompanyId();

    const body = await request.json();
    const data = prescriptionSchema.parse(body);

    const prescription = await prescriptionService.create(data, companyId);

    return NextResponse.json({
      success: true,
      data: prescription,
      message: "Receita cadastrada com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
