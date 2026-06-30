/**
 * Motor de auto-move do funil (Funil Inteligente — Fatia 3). Orquestra a régua
 * (funnel-advance) e os sinais (funnel-signals) ATRAVÉS das travas, e move o
 * card via `moveLead(movedBy:"AI")`.
 *
 * Chamado pelo cron de qualificação DEPOIS de a IA classificar a conversa, só
 * quando a conversa JÁ é um lead (re-qualificação). Toda a segurança vive aqui:
 *  - kill-switch por ótica (FUNNEL_AUTOMOVE_COMPANIES) — OFF por padrão;
 *  - trava humana INTELIGENTE: se um humano moveu o card (lastMovedBy=USER), a
 *    IA só age se a conversa evoluiu (lastMessageAt > aiLockUntilMessageAt);
 *  - régua só-avança-1 / nunca-terminal / flag em reclamação;
 *  - fail-safe: erro NÃO propaga (não quebra o cron de qualificação).
 *
 * Multi-tenant: companyId em todo filtro.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { moveLead } from "@/services/lead.service";
import { decideFunnelAdvance, type FunnelAction } from "@/lib/funnel-advance";
import { clientEngaged, oticaSentValue } from "@/lib/funnel-signals";
import { isFunnelAutoMoveOn } from "@/lib/funnel-automove-flag";
import type { ContactIntent } from "@/lib/ai/lead-qualifier";

const log = logger.child({ service: "funnel-automove" });

export interface AutoAdvanceInput {
  conversationId: string;
  leadId: string;
  companyId: string;
  intent: ContactIntent;
  confidence: number;
}

export interface AutoAdvanceResult {
  moved: boolean;
  action?: FunnelAction;
  reason: string;
}

const skip = (reason: string): AutoAdvanceResult => ({ moved: false, reason });

export async function maybeAutoAdvanceLead(input: AutoAdvanceInput): Promise<AutoAdvanceResult> {
  const { conversationId, leadId, companyId, intent, confidence } = input;

  // 1. Kill-switch por ótica (OFF por padrão).
  if (!isFunnelAutoMoveOn(companyId)) return skip("auto-move desligado p/ esta ótica");

  try {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, companyId, deletedAt: null },
      select: { id: true, stageId: true, lastMovedBy: true, aiLockUntilMessageAt: true },
    });
    if (!lead) return skip("lead não encontrado");

    const conv = await prisma.whatsappConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { lastMessageAt: true },
    });

    // 2. Trava humana INTELIGENTE: se um humano moveu por último, a IA só age se
    //    chegou mensagem MAIS NOVA que o ponto travado (conversa evoluiu). Se não
    //    há ponto travado (lead manual sem conversa), a IA fica travada SEMPRE —
    //    sem sinal de "evoluiu", respeitar o humano é o seguro (fecha o gap do
    //    aiLockUntilMessageAt null não destravar).
    if (lead.lastMovedBy === "USER") {
      const evolved =
        !!lead.aiLockUntilMessageAt &&
        !!conv?.lastMessageAt &&
        conv.lastMessageAt.getTime() > lead.aiLockUntilMessageAt.getTime();
      if (!evolved) return skip("trava humana ativa (humano moveu, sem msg nova)");
    }

    // 3. Sinais da conversa (lib pura) a partir das mensagens.
    const messages = await prisma.whatsappMessage.findMany({
      where: { conversationId, companyId },
      select: { direction: true, type: true, text: true },
    });
    const stages = await prisma.leadStage.findMany({
      where: { companyId },
      select: { id: true, order: true, isWon: true, isLost: true },
    });

    // 4. Régua.
    const decision = decideFunnelAdvance({
      intent,
      confidence,
      currentStageId: lead.stageId,
      stages,
      clientEngaged: clientEngaged(messages),
      oticaSentValue: oticaSentValue(messages),
    });

    if (decision.action !== "move" || !decision.targetStageId) {
      // hold/flag → não move. (flag é sinalizado pela telemetria/inbox existente.)
      return { moved: false, action: decision.action, reason: decision.reason };
    }

    // 5. Move via moveLead(AI) — passa pelas validações do writer único.
    await moveLead(lead.id, { stageId: decision.targetStageId }, companyId, "AI");
    log.info("auto_move_lead", { leadId: lead.id, companyId, from: lead.stageId, to: decision.targetStageId });
    return { moved: true, action: "move", reason: decision.reason };
  } catch (e) {
    // NÃO propaga — o cron de qualificação não pode quebrar por causa do auto-move.
    log.error("auto_move_failed", { leadId, companyId, error: e instanceof Error ? e.message : String(e) });
    return skip("erro no auto-move (fail-safe)");
  }
}
