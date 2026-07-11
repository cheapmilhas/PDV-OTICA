import { NextRequest } from "next/server";
import {
  requireAuth,
  requirePermission,
  getCompanyId,
  getUserId,
} from "@/lib/auth-helpers";
import { createdResponse, successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import {
  createExamAppointment,
  listExamAppointmentsForDay,
} from "@/services/exam-appointment.service";
import { createExamAppointmentSchema } from "@/lib/validations/exam-appointment.schema";

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const body = createExamAppointmentSchema.parse(await req.json());
    const appt = await createExamAppointment(
      {
        leadId: body.leadId,
        scheduledAt: body.scheduledAt,
        assignedUserId: body.assignedUserId ?? null,
        note: body.note ?? null,
      },
      companyId,
      userId
    );
    return createdResponse(appt);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const day = dateParam ? new Date(dateParam) : new Date();
    const qb = searchParams.get("branchId");
    const branchId = qb && qb !== "ALL" ? qb : null;
    const list = await listExamAppointmentsForDay(day, companyId, branchId);
    return successResponse(list);
  } catch (error) {
    return handleApiError(error);
  }
}
