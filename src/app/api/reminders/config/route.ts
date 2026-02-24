import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { reminderService } from "@/services/reminder.service";
import { reminderConfigSchema } from "@/lib/validations/reminder.schema";

export async function GET() {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const config = await reminderService.getConfig(branchId);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePermission("settings.edit");
    const branchId = await getBranchId();
    const body = await request.json();
    const data = reminderConfigSchema.parse(body);
    const config = await reminderService.updateConfig(branchId, data);
    return NextResponse.json({ success: true, data: config, message: "Configuração atualizada" });
  } catch (error) {
    return handleApiError(error);
  }
}
