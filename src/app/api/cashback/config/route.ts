import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { cashbackService } from "@/services/cashback.service";
import { cashbackConfigSchema } from "@/lib/validations/cashback.schema";

// GET - Buscar configuração do cashback
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const branchId = await getBranchId();

    const config = await cashbackService.getConfig(branchId, companyId);

    return NextResponse.json({
      success: true,
      data: JSON.parse(JSON.stringify(config)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT - Atualizar configuração do cashback
export async function PUT(request: NextRequest) {
  try {
    await requirePermission("settings.edit");
    const companyId = await getCompanyId();
    const branchId = await getBranchId();

    const body = await request.json();
    const data = cashbackConfigSchema.parse(body);

    const config = await cashbackService.updateConfig(
      branchId,
      companyId,
      data
    );

    return NextResponse.json({
      success: true,
      data: JSON.parse(JSON.stringify(config)),
      message: "Configuração de cashback atualizada com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
