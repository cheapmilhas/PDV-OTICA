import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getUserId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { reminderService } from "@/services/reminder.service";
import { updateReminderSchema } from "@/lib/validations/reminder.schema";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("reminders.view");
    const userId = await getUserId();
    const { id } = await params;
    const body = await request.json();
    const data = updateReminderSchema.parse(body);
    const reminder = await reminderService.updateReminder(id, data, userId);
    return NextResponse.json({ success: true, data: reminder, message: "Lembrete atualizado" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("reminders.view");
    const { id } = await params;
    const reminder = await reminderService.startReminder(id);
    return NextResponse.json({ success: true, data: reminder });
  } catch (error) {
    return handleApiError(error);
  }
}
