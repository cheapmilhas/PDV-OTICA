import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse, createdResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { listStages, createStage, ensureDefaultStages } from "@/services/lead-stage.service";
import { createLeadStageSchema } from "@/lib/validations/lead.schema";

/**
 * GET /api/lead-stages
 * Lista as etapas do funil da empresa. Garante o funil padrão no 1º acesso
 * (ensureDefaultStages é aditivo + idempotente).
 */
export async function GET() {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    await ensureDefaultStages(companyId);
    const stages = await listStages(companyId);
    return successResponse(stages);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/lead-stages
 * Cria uma nova etapa do funil.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const data = createLeadStageSchema.parse(await request.json());
    const stage = await createStage(companyId, data);
    return createdResponse(stage);
  } catch (error) {
    return handleApiError(error);
  }
}
