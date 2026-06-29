import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { assertAiAllowed } from "@/lib/ai-guard";
import { prisma } from "@/lib/prisma";
import { qualifyConversation } from "@/services/conversation-qualifier.service";
import { handleApiError, notFoundError, forbiddenError } from "@/lib/error-handler";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    await requirePermission("leads.create");
    const companyId = await getCompanyId();
    const { id } = await ctx.params;

    const conv = await prisma.whatsappConversation.findUnique({ where: { id }, select: { id: true, companyId: true } });
    if (!conv || conv.companyId !== companyId) throw notFoundError("Conversa não encontrada");

    // Checagem fail-CLOSED própria (HIGH-2): assertAiAllowed é fail-OPEN em erro
    // de infra (certo p/ o OCR interativo, errado p/ uma ação que custa IA). Aqui,
    // se a leitura das flags falhar, bloqueamos — não rodamos a IA na dúvida.
    let settings;
    try {
      settings = await prisma.companySettings.findUnique({
        where: { companyId },
        select: { iaAvailable: true, iaEnabled: true },
      });
    } catch {
      throw forbiddenError("Não foi possível verificar a disponibilidade da IA. Tente novamente.");
    }
    if (!settings || !settings.iaAvailable || !settings.iaEnabled) {
      throw forbiddenError("IA indisponível ou desligada para esta ótica.");
    }

    // Mantém também a checagem de cota do guard (cota mensal). assertAiAllowed
    // re-lê as flags, mas a checagem acima já garante a postura fail-closed.
    await assertAiAllowed(companyId);

    const result = await qualifyConversation(id, { force: true });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
