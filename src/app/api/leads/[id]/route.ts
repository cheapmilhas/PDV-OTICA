import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse, deletedResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { getLeadById, updateLead, deleteLead } from "@/services/lead.service";
import { updateLeadSchema } from "@/lib/validations/lead.schema";

/**
 * GET /api/leads/[id]
 * Busca um lead por ID (multi-tenant).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const { id } = await params;
    return successResponse(await getLeadById(id, companyId));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/leads/[id]
 * Atualiza um lead.
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
    const data = updateLeadSchema.parse(await request.json());
    const lead = await updateLead(id, data, companyId);
    return successResponse({
      ...lead,
      estimatedValue: lead.estimatedValue == null ? null : Number(lead.estimatedValue),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/leads/[id]
 * Remove um lead (soft-delete).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await requirePermission("leads.delete");
    const companyId = await getCompanyId();
    const { id } = await params;
    await deleteLead(id, companyId);
    return deletedResponse();
  } catch (error) {
    return handleApiError(error);
  }
}
