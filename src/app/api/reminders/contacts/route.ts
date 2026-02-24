import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId, getUserId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { reminderService } from "@/services/reminder.service";
import { createContactSchema } from "@/lib/validations/reminder.schema";

export async function POST(request: NextRequest) {
  try {
    await requirePermission("reminders.view");
    const branchId = await getBranchId();
    const userId = await getUserId();
    const body = await request.json();
    const data = createContactSchema.parse(body);
    const contact = await reminderService.createContact(data, branchId, userId);
    return NextResponse.json({ success: true, data: contact, message: "Contato registrado" });
  } catch (error) {
    return handleApiError(error);
  }
}
