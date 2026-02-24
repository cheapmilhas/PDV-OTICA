import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { goalsService } from "@/services/goals.service";
import { commissionConfigSchema } from "@/lib/validations/goals.schema";
import { requirePlanFeature } from "@/lib/plan-features";

export async function GET() {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    const config = await goalsService.getCommissionConfig(branchId);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    await requirePermission("settings.edit");
    const body = await request.json();
    const data = commissionConfigSchema.parse(body);
    const config = await goalsService.updateCommissionConfig(branchId, data);
    return NextResponse.json({ success: true, data: config, message: "Configuração atualizada" });
  } catch (error) {
    return handleApiError(error);
  }
}
