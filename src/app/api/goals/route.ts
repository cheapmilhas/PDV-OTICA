import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { goalsService } from "@/services/goals.service";
import { salesGoalSchema, goalsQuerySchema } from "@/lib/validations/goals.schema";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const { searchParams } = new URL(request.url);

    const query = goalsQuerySchema.parse({
      year: searchParams.get("year") || undefined,
      month: searchParams.get("month") || undefined,
      status: searchParams.get("status") || undefined,
    });

    const goals = await goalsService.listGoals(branchId, query);
    return NextResponse.json({ success: true, data: goals });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    await requirePermission("goals.view");
    const body = await request.json();
    const data = salesGoalSchema.parse(body);
    const goal = await goalsService.createOrUpdateGoal(branchId, data);
    return NextResponse.json({ success: true, data: goal, message: "Meta salva com sucesso" });
  } catch (error) {
    return handleApiError(error);
  }
}
