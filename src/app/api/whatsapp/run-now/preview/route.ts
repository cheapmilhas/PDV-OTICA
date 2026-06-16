import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { runWhatsappAutomations } from "@/services/whatsapp-automation.service";

/**
 * GET /api/whatsapp/run-now/preview
 *
 * Prévia (modo simulação) do disparo manual: roda a MESMA varredura do
 * "Processar agora" em dryRun — NÃO envia e NÃO persiste — e devolve a lista do
 * que sairia HOJE (apenas os clientes elegíveis). Escopo: só a ótica da sessão.
 * Gated por settings.edit + feature flag.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const result = await runWhatsappAutomations(new Date(), { companyId, dryRun: true });

    return NextResponse.json({
      success: true,
      data: { preview: result.preview },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
