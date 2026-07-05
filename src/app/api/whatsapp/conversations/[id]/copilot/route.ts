import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { assertAiAllowed } from "@/lib/ai-guard";
import { prisma } from "@/lib/prisma";
import { summarizeAndDraft, COPILOT_MODEL, type CopilotMessage } from "@/lib/ai/conversation-copilot";
import { logAiUsage } from "@/services/ai-usage.service";
import { handleApiError, notFoundError, forbiddenError } from "@/lib/error-handler";

/**
 * POST /api/whatsapp/conversations/[id]/copilot
 * Copiloto INTERNO: resumo da conversa + rascunho de resposta pra atendente COPIAR.
 * A IA nunca envia nada — a atendente manda do celular. Stateless (não persiste).
 * Gated por disponibilidade + cota de IA (mesmo padrão da rota /qualify).
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const { id } = await ctx.params;

    const conv = await prisma.whatsappConversation.findUnique({
      where: { id },
      select: {
        id: true, companyId: true,
        messages: {
          select: { direction: true, text: true, type: true, receivedAt: true },
          // As 60 MAIS RECENTES (desc) — o resumo/rascunho tem que refletir o
          // contexto atual, não as primeiras 60 mensagens de meses atrás.
          // Revertidas p/ ordem cronológica antes de montar o transcript.
          orderBy: { receivedAt: "desc" },
          take: 60,
        },
      },
    });
    if (!conv || conv.companyId !== companyId) throw notFoundError("Conversa não encontrada");

    // Fail-CLOSED: se a leitura das flags falhar, NÃO roda a IA (custa dinheiro).
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
    await assertAiAllowed(companyId);

    // conv.messages veio em ordem desc (mais recentes); reverte p/ cronológico.
    const messages: CopilotMessage[] = [...conv.messages].reverse().map((m) => ({
      direction: m.direction as "inbound" | "outbound",
      text: m.text,
      type: m.type,
    }));
    const result = await summarizeAndDraft(messages);

    // Registra o gasto p/ a cota mensal enxergar o copiloto (senão assertAiAllowed
    // ficaria cego a essa feature e ela nunca contaria pro teto). Best-effort:
    // uma falha de telemetria não deve derrubar a resposta ao usuário.
    try {
      await logAiUsage({
        companyId, feature: "whatsapp_copilot", provider: "anthropic", model: COPILOT_MODEL,
        inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, cacheTokens: result.usage.cacheTokens, cacheWriteTokens: result.usage.cacheWriteTokens,
      });
    } catch { /* telemetria não bloqueia a resposta */ }

    return NextResponse.json({ summary: result.summary, draft: result.draft, parseError: result.parseError });
  } catch (error) {
    return handleApiError(error);
  }
}
