import { NextResponse } from "next/server";
import { requireAuth, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { reminderService } from "@/services/reminder.service";

export async function GET() {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const summary = await reminderService.getSummary(branchId);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return handleApiError(error);
  }
}
