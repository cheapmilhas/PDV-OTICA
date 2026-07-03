import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import {
  previewArchiveOldNumber,
  archiveOldNumberConversations,
  unarchiveConversations,
} from "@/services/whatsapp-archive.service";

/**
 * Arquivamento de conversas na TROCA DE NÚMERO da loja.
 *
 * GET  → preview: quantas conversas do número antigo seriam arquivadas com a
 *        troca DETECTADA automaticamente (numberChangedAt). Não muda nada.
 * POST → aplica (body { action, mode }):
 *        action=archive (default): arquiva com o corte da troca detectada.
 *          mode="all-current": corte = AGORA (dono já trocou antes da feature
 *          existir e confirma que quer limpar tudo que está lá hoje).
 *        action=unarchive: desfaz (escapatória) — reabre TODAS as arquivadas.
 *
 * Permissão settings.edit (mesma de connect/disconnect). Sempre por companyId.
 */
export async function GET() {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }
    const preview = await previewArchiveOldNumber(companyId);
    return NextResponse.json({ success: true, data: preview });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const body = await request.json().catch(() => ({}));
    const action = body?.action === "unarchive" ? "unarchive" : "archive";

    if (action === "unarchive") {
      const result = await unarchiveConversations(companyId);
      return NextResponse.json({ success: true, data: result });
    }

    // mode "all-current": o dono trocou o número ANTES desta feature existir (não
    // há numberChangedAt detectado), mas confirma que quer arquivar tudo que está
    // no funil hoje. Corte = agora. Sem esse override, cai na troca detectada.
    const cutoff = body?.mode === "all-current" ? new Date() : undefined;
    const result = await archiveOldNumberConversations(companyId, cutoff);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
