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
    // LGPD: receita é dado clínico sensível — exige permissão de leitura.
    await requirePermission("prescriptions.view");
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    // Sentinelas "ALL"/"" da UI viram undefined ANTES do parse (o schema valida
    // branchId como cuid e status como enum — "ALL" não passaria a validação).
    const rawBranchId = searchParams.get("branchId");
    const rawStatus = searchParams.get("status");
    const query = prescriptionQuerySchema.parse({
      customerId: searchParams.get("customerId") || undefined,
      page: searchParams.get("page") || 1,
      pageSize: searchParams.get("pageSize") || 10,
      search: searchParams.get("search") || undefined,
      validadeDe: searchParams.get("validadeDe") || undefined,
      validadeAte: searchParams.get("validadeAte") || undefined,
      emitidaDe: searchParams.get("emitidaDe") || undefined,
      emitidaAte: searchParams.get("emitidaAte") || undefined,
      branchId: rawBranchId && rawBranchId !== "ALL" && rawBranchId !== "all" ? rawBranchId : undefined,
      status: rawStatus && rawStatus !== "ALL" ? rawStatus : undefined,
    });

    const result = await prescriptionService.list(
      companyId,
      query.page,
      query.pageSize,
      query.customerId,
      query.branchId,
      query.status,
      query.search,
      query.validadeDe,
      query.validadeAte,
      query.emitidaDe,
      query.emitidaAte
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
