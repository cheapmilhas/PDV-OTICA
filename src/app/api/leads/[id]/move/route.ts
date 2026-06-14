import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { moveLead } from "@/services/lead.service";
import { moveLeadSchema } from "@/lib/validations/lead.schema";

/**
 * PATCH /api/leads/[id]/move
 * Move um lead para outra etapa. Usa optimistic-lock (expectedUpdatedAt) e
 * exige lostReason quando a etapa destino é `isLost`.
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
    const data = moveLeadSchema.parse(await request.json());
    const lead = await moveLead(id, data, companyId);
    return successResponse({
      ...lead,
      estimatedValue: lead.estimatedValue == null ? null : Number(lead.estimatedValue),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
