import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { runWhatsappAutomations } from "@/services/whatsapp-automation.service";
import { processWhatsappQueue } from "@/services/whatsapp-queue-processor";

/**
 * POST /api/whatsapp/run-now
 *
 * Para a ótica do usuário logado (companyId vem da sessão, nunca do body):
 * (1) ENFILEIRA tudo que está pendente hoje (modo enqueue, idempotente) e
 * (2) dispara a 1ª leva da fila (1 msg/ótica, respeitando horário/teto/lock).
 * O restante da fila é drenado aos poucos pelo acionador externo (anti-bloqueio).
 * Gated por settings.edit + feature flag por empresa.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    // 1) Enfileira tudo da ótica. 2) Solta a 1ª leva (anti-bloqueio: aos poucos).
    await runWhatsappAutomations(new Date(), { companyId, enqueue: true });
    const result = await processWhatsappQueue(new Date(), { companyId });

    return NextResponse.json({
      success: true,
      data: {
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
        pendingRestantes: result.pendingRestantes,
        skippedOutOfHours: result.skippedOutOfHours,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
