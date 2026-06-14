import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse, deletedResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { updateStage, deleteStage } from "@/services/lead-stage.service";
import { updateLeadStageSchema } from "@/lib/validations/lead.schema";

/**
 * PATCH /api/lead-stages/[id]
 * Atualiza uma etapa do funil.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const { id } = await params;
    const data = updateLeadStageSchema.parse(await request.json());
    const stage = await updateStage(id, companyId, data);
    return successResponse(stage);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/lead-stages/[id]
 * Remove uma etapa do funil (bloqueada se terminal ou com leads dentro).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const { id } = await params;
    await deleteStage(id, companyId);
    return deletedResponse();
  } catch (error) {
    return handleApiError(error);
  }
}
