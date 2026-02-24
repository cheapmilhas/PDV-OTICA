import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { reminderService } from "@/services/reminder.service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || undefined;
    const reminders = await reminderService.getTodayReminders(branchId, type);
    return NextResponse.json({ success: true, data: reminders });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    await requirePermission("reminders.view");
    const branchId = await getBranchId();
    const companyId = await getCompanyId();
    const result = await reminderService.generateAllReminders(branchId, companyId);
    return NextResponse.json({ success: true, data: result, message: `${result.total} lembretes gerados` });
  } catch (error) {
    return handleApiError(error);
  }
}
