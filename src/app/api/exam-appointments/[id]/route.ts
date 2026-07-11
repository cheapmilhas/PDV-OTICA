import { NextRequest } from "next/server";
import { requireAuth, requirePermission, getCompanyId } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { updateExamAppointment } from "@/services/exam-appointment.service";
import { updateExamAppointmentSchema } from "@/lib/validations/exam-appointment.schema";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const { id } = await params;
    const body = updateExamAppointmentSchema.parse(await req.json());
    const updated = await updateExamAppointment(id, body, companyId);
    return successResponse(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
