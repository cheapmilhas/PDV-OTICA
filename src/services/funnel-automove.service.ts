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
import { clientEngaged, oticaSentValue, shopReplied } from "@/lib/funnel-signals";
import { isFunnelAutoMoveOn } from "@/lib/funnel-automove-flag";
import { recordAutoMoveTrace } from "@/services/funnel-automove-trace.service";
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

export async function maybeAutoAdvanceLead(input: AutoAdvanceInput): Promise<AutoAdvanceResult> {
  const { conversationId, leadId, companyId, intent, confidence } = input;
  const killSwitchOn = isFunnelAutoMoveOn(companyId);
  // "set"/"unset" da env no runtime que rodou — prova de propagação (sem expor a
  // lista crua de companyIds). Acompanha cada trilha p/ auditar "a env chegou?".
  const envSeen = process.env.FUNNEL_AUTOMOVE_COMPANIES ? "set" : "unset";

  // OBSERVABILIDADE (Fatia 3): emite a decisão. Loga SEMPRE (1 linha estruturada)
  // e — quando a decisão é INTERESSANTE (persist=true) — grava também na trilha
  // append-only `FunnelAutoMoveLog`, que é o canal de leitura CONFIÁVEL (o cron
  // async da Vercel não entrega logs) e a base da métrica de acurácia. O caminho
  // kill-switch-off e os holds triviais NÃO persistem (persist=false) p/ evitar
  // amplificação de escrita no cron (rodaria p/ todo lead a cada ciclo).
  const decide = async (
    r: AutoAdvanceResult,
    persist: boolean,
    extra?: Record<string, unknown>,
  ): Promise<AutoAdvanceResult> => {
    log.info("auto_move_decision", {
      leadId, companyId, intent, confidence, killSwitchOn,
      moved: r.moved, action: r.action ?? null, reason: r.reason,
      ...extra,
    });
    if (persist) {
      await recordAutoMoveTrace({
        companyId, leadId, action: r.action ?? "hold", moved: r.moved,
        reason: r.reason, killSwitchOn, intent, confidence, envSeen,
      });
    }
    return r;
  };

  // 1. Kill-switch por ótica (OFF por padrão). NÃO persiste (caminho comum/mudo).
  if (!killSwitchOn) return decide({ moved: false, reason: "auto-move desligado p/ esta ótica" }, false);

  // Guarda o move bem-sucedido p/ gravar a trilha de SUCESSO fora do try (HIGH-1).
  let moved: { decision: { reason: string; targetStageId?: string }; fromStageId: string } | null = null;
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, companyId, deletedAt: null },
      select: { id: true, stageId: true, lastMovedBy: true, aiLockUntilMessageAt: true },
    });
    if (!lead) return decide({ moved: false, reason: "lead não encontrado" }, false);

    const conv = await prisma.whatsappConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { lastMessageAt: true },
    });

    // 2. Trava humana INTELIGENTE: se um humano moveu por último, a IA só age se
    //    chegou mensagem MAIS NOVA que o ponto travado (conversa evoluiu). Se não
    //    há ponto travado (lead manual sem conversa), a IA fica travada SEMPRE —
    //    sem sinal de "evoluiu", respeitar o humano é o seguro (fecha o gap do
    //    aiLockUntilMessageAt null não destravar). PERSISTE: o humano-vs-IA é
    //    exatamente o sinal que a métrica de acurácia quer.
    if (lead.lastMovedBy === "USER") {
      const evolved =
        !!lead.aiLockUntilMessageAt &&
        !!conv?.lastMessageAt &&
        conv.lastMessageAt.getTime() > lead.aiLockUntilMessageAt.getTime();
      if (!evolved) {
        return decide({ moved: false, reason: "trava humana ativa (humano moveu, sem msg nova)" }, true);
      }
    }

    // 3. Sinais da conversa (lib pura) a partir das mensagens.
    const messages = await prisma.whatsappMessage.findMany({
      where: { conversationId, companyId },
      select: { direction: true, type: true, text: true },
    });
    const stages = await prisma.leadStage.findMany({
      where: { companyId },
      // name entra p/ o pulo do R$ (Item 4) mirar o "Orçamento" por semântica.
      select: { id: true, order: true, isWon: true, isLost: true, name: true },
    });

    const engaged = clientEngaged(messages);
    const sentValue = oticaSentValue(messages);
    const replied = shopReplied(messages);

    // 4. Régua.
    const decision = decideFunnelAdvance({
      intent, confidence, currentStageId: lead.stageId, stages,
      clientEngaged: engaged, shopReplied: replied, oticaSentValue: sentValue,
    });

    if (decision.action !== "move" || !decision.targetStageId) {
      // hold/flag → não move. `flag` (reclamação/cobrança → sinaliza humano)
      // PERSISTE (decisão relevante p/ o inbox/telemetria); `hold` trivial NÃO
      // (não há sinal de compra → ruído a cada ciclo).
      const persist = decision.action === "flag";
      return decide(
        { moved: false, action: decision.action, reason: decision.reason },
        persist,
        { currentStageId: lead.stageId, clientEngaged: engaged, shopReplied: replied, oticaSentValue: sentValue },
      );
    }

    // 5. Move via moveLead(AI) — passa pelas validações do writer único. Só ISTO
    //    fica no try: se moveLead falha, é erro de verdade (linha "error"). A
    //    trilha de SUCESSO é gravada FORA do try (abaixo) p/ que uma falha do
    //    logger/trace NÃO rotule um move já aplicado como "error" (HIGH-1).
    await moveLead(lead.id, { stageId: decision.targetStageId }, companyId, "AI");
    moved = { decision, fromStageId: lead.stageId };
  } catch (e) {
    // NÃO propaga — o cron de qualificação não pode quebrar por causa do auto-move.
    // PERSISTE incondicionalmente: a linha de erro é justamente o que estávamos
    // caçando às cegas (exceção engolida e invisível nos logs do cron).
    const msg = e instanceof Error ? e.message : String(e);
    log.error("auto_move_failed", { leadId, companyId, error: msg });
    await recordAutoMoveTrace({
      companyId, leadId, action: "error", moved: false,
      reason: "erro no auto-move (fail-safe)", killSwitchOn, intent, confidence, envSeen, error: msg,
    });
    return { moved: false, reason: "erro no auto-move (fail-safe)" };
  }

  // Defesa de tipo: todos os caminhos não-move dentro do try fazem `return`, então
  // só se chega aqui com `moved` preenchido. O guard satisfaz o compilador e é um
  // no-op em runtime.
  if (!moved) return { moved: false, reason: "sem movimento" };

  // Move JÁ aplicado com sucesso. Grava a trilha de sucesso FORA do try: a partir
  // daqui nenhuma falha de telemetria pode reescrever o resultado como "error".
  return decide(
    { moved: true, action: "move", reason: moved.decision.reason },
    true,
    { from: moved.fromStageId, to: moved.decision.targetStageId },
  );
}
