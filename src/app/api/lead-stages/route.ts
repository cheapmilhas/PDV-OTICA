import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse, createdResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import {
  listStages,
  createStage,
  ensureDefaultStages,
  ensureOpticalStages,
} from "@/services/lead-stage.service";
import { createLeadStageSchema } from "@/lib/validations/lead.schema";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "lead-stages" });

/**
 * GET /api/lead-stages
 * Lista as etapas do funil da empresa. Garante o funil padrão no 1º acesso
 * (ensureDefaultStages) e faz backfill das colunas de ótica (ensureOpticalStages),
 * ambos aditivos + idempotentes. O seed é BEST-EFFORT: uma falha nele (blip de DB,
 * timeout de tx) é logada e tolerada — o board sempre carrega a partir do que existe,
 * pois o funil é caminho de leitura crítico das operações do dia a dia.
 */
export async function GET() {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    // Seed é best-effort: garante os estágios padrão + colunas de ótica, mas uma
    // falha aqui (blip de DB, timeout de tx) NÃO pode derrubar o board — o funil é
    // caminho de leitura crítico. Loga e segue p/ listar o que existe.
    try {
      await ensureDefaultStages(companyId);
      await ensureOpticalStages(companyId);
    } catch (seedError) {
      log.error("lead_stages_seed_failed", {
        companyId,
        error: seedError instanceof Error ? seedError.message : String(seedError),
      });
    }
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
