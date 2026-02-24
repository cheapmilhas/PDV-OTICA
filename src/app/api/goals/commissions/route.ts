import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { goalsService } from "@/services/goals.service";
import { closeMonthSchema } from "@/lib/validations/goals.schema";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const { searchParams } = new URL(request.url);

    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;

    const commissions = await goalsService.getCommissions(branchId, year, month);
    return NextResponse.json({ success: true, data: commissions });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - Fechar mês e calcular comissões
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    await requirePermission("settings.edit");
    const body = await request.json();
    const data = closeMonthSchema.parse(body);
    const result = await goalsService.closeMonth(branchId, data);
    return NextResponse.json({ success: true, data: result, message: result.message });
  } catch (error) {
    return handleApiError(error);
  }
}
