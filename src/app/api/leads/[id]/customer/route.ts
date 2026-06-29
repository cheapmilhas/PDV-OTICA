import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { setLeadCustomer } from "@/services/lead.service";

const bodySchema = z.object({
  // null = desvincular (vendedor desfaz). string = confirmar o vínculo sugerido.
  customerId: z.string().min(1).nullable(),
});

/**
 * PATCH /api/leads/[id]/customer
 * Confirma (ou desfaz) o vínculo lead↔cliente sugerido pela IA. Writer DEDICADO:
 * valida tenant do lead E do customer (fecha IDOR). Exige leads.edit.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const { id } = await params;
    const { customerId } = bodySchema.parse(await request.json());
    const lead = await setLeadCustomer(id, customerId, companyId);
    return successResponse(lead);
  } catch (error) {
    return handleApiError(error);
  }
}
