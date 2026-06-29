import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { correctLeadIntent } from "@/services/lead.service";
import { INTENT_VALUES } from "@/lib/contact-intent-label";

// Allowlist canônica (fonte única em contact-intent-label) — entrada inválida é
// barrada já no zod; o service revalida por segurança (defesa em profundidade).
const bodySchema = z.object({
  intent: z.enum(INTENT_VALUES),
});

/**
 * PATCH /api/leads/[id]/intent
 * Correção HUMANA da intenção classificada pela IA (telemetria de acurácia).
 * Writer DEDICADO: valida tenant do lead (fecha IDOR), preserva o palpite
 * original (intentPredicted) e registra quem/quando corrigiu. Exige leads.edit.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const { id } = await params;
    const { intent } = bodySchema.parse(await request.json());
    const lead = await correctLeadIntent(id, intent, companyId, session.user.id);
    return successResponse(lead);
  } catch (error) {
    return handleApiError(error);
  }
}
