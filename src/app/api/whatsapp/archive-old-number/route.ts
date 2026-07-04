import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import {
  previewArchiveOldNumber,
  archiveOldNumberConversations,
  unarchiveConversations,
  listArchivedBatches,
  setQualifyCutoffNow,
  clearQualifyCutoff,
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
    // preview (troca detectada) + levas já arquivadas (p/ desarquivar granular).
    const [preview, batches] = await Promise.all([
      previewArchiveOldNumber(companyId),
      listArchivedBatches(companyId),
    ]);
    return NextResponse.json({ success: true, data: { ...preview, batches } });
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
    const rawAction = body?.action;
    const action =
      rawAction === "unarchive" ? "unarchive"
      : rawAction === "set-qualify-cutoff" ? "set-qualify-cutoff"
      : rawAction === "clear-qualify-cutoff" ? "clear-qualify-cutoff"
      : "archive";

    // "Qualificar só daqui pra frente": corta o backlog da IA (não gasta cota com
    // conversas antigas). O dono aciona ao trocar de número / limpar o funil.
    if (action === "set-qualify-cutoff") {
      const result = await setQualifyCutoffNow(companyId);
      return NextResponse.json({ success: true, data: result });
    }
    if (action === "clear-qualify-cutoff") {
      await clearQualifyCutoff(companyId);
      return NextResponse.json({ success: true, data: { qualifyFromAt: null } });
    }

    if (action === "unarchive") {
      // batchArchivedAt opcional: desarquiva só aquela leva; sem ele, todas.
      const batchRaw = typeof body?.batchArchivedAt === "string" ? body.batchArchivedAt : null;
      const batch = batchRaw ? new Date(batchRaw) : undefined;
      if (batchRaw && Number.isNaN(batch!.getTime())) {
        return NextResponse.json(
          { error: { code: "BAD_REQUEST", message: "batchArchivedAt inválido." } },
          { status: 400 },
        );
      }
      const result = await unarchiveConversations(companyId, batch);
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
