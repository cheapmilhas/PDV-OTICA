import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { goalsService } from "@/services/goals.service";
import { requirePlanFeature } from "@/lib/plan-features";

interface Params {
  params: Promise<{ id: string }>;
}

// PUT - Marcar comissão como paga
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    await requirePermission("goals.manage");
    const { id } = await params;
    const commission = await goalsService.markCommissionAsPaid(id);
    return NextResponse.json({ success: true, data: commission, message: "Comissão marcada como paga" });
  } catch (error) {
    return handleApiError(error);
  }
}
