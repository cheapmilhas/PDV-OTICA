import { NextResponse } from "next/server";
import { requireAuth, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { goalsService } from "@/services/goals.service";

export async function GET() {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const sellers = await goalsService.getBranchSellers(branchId);
    return NextResponse.json({ success: true, data: sellers });
  } catch (error) {
    return handleApiError(error);
  }
}
