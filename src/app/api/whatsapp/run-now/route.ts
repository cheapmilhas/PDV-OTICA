import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { runWhatsappAutomations } from "@/services/whatsapp-automation.service";

/**
 * POST /api/whatsapp/run-now
 *
 * Dispara as automações de WhatsApp na hora, SOMENTE para a ótica do usuário
 * logado (companyId vem da sessão, nunca do body). Mesma varredura do cron
 * diário /api/cron/whatsapp-messages — idempotente (não reenvia o que já saiu
 * hoje). Gated por settings.edit + feature flag por empresa.
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

    const result = await runWhatsappAutomations(new Date(), { companyId });

    return NextResponse.json({
      success: true,
      data: {
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
        byType: result.byType,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
