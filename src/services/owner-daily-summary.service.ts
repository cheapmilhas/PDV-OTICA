import { prisma } from "@/lib/prisma";
import { startOfLocalDay } from "@/lib/date-utils";

/**
 * "Resumo do dono" (Sprint 5, #12) — o dia da ótica num relance, pro dono olhar
 * de manhã: quantas conversas tiveram mensagem do cliente HOJE, quantas já foram
 * respondidas vs. ainda esperando, e quantas acenderam o alarme de reclamação.
 *
 * Fonte = fluxo REAL de mensagens (nada de botão). "Hoje" é o dia no fuso da
 * ótica (America/Sao_Paulo), não do servidor. Read-only, multi-tenant.
 *
 * ⚠️ ESCOPO É COMPANY-WIDE (toda a ótica), NÃO por filial: o WhatsApp é
 * compartilhado entre as filiais (não há filial "dona" de uma conversa), então o
 * resumo do dia é da ótica inteira. A UI rotula "todas as filiais" p/ deixar claro
 * que difere da fila de leads (que é por filial). Ver o void branchId abaixo.
 *
 * ⚠️ "Respondida" AQUI é uma lente de CONVERSA/DIA, DIFERENTE do "precisa
 * responder" da fila de leads (#5, `lead-needs-reply.service.ts`) — de propósito,
 * NÃO reconciliar sem querer: lá é por LEAD e "existe qualquer outbound"; aqui é
 * por CONVERSA e mede se a ótica respondeu DEPOIS da última fala do cliente
 * (outbound com data >= última inbound). São populações e perguntas diferentes.
 * "Sem resposta" = tem inbound hoje e nenhum outbound após a última inbound.
 */

export interface OwnerDailySummary {
  /** Conversas com ao menos uma mensagem do cliente hoje. */
  conversations: number;
  /** Dessas, quantas a ótica já respondeu (outbound após a última inbound). */
  replied: number;
  /** Dessas, quantas ainda aguardam resposta (a bola está com a ótica). */
  awaiting: number;
  /** Dessas, quantas acenderam o alarme (reclamação/cobrança/urgente). */
  complaints: number;
}

export async function getOwnerDailySummary(
  companyId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<OwnerDailySummary> {
  const todayStart = startOfLocalDay(now);

  // Conversas (da empresa) com INBOUND hoje + a data da última inbound por conversa.
  // groupBy é barato (índice conversationId, receivedAt) e não traz texto.
  const inboundToday = await prisma.whatsappMessage.groupBy({
    by: ["conversationId"],
    where: { companyId, direction: "inbound", receivedAt: { gte: todayStart } },
    _max: { receivedAt: true },
  });
  if (inboundToday.length === 0) {
    return { conversations: 0, replied: 0, awaiting: 0, complaints: 0 };
  }

  const lastInboundByConv = new Map<string, Date>();
  for (const g of inboundToday) {
    if (g._max.receivedAt) lastInboundByConv.set(g.conversationId, g._max.receivedAt);
  }
  const convIds = [...lastInboundByConv.keys()];

  // COMPANY-WIDE de propósito (ver docstring): a conversa não tem filial própria
  // (WhatsApp compartilhado). Escopar por Lead.branchId DERRUBARIA as conversas
  // não-lead — inclusive as RECLAMAÇÕES, que muitas vezes nem são lead — subcontando
  // justo o que o dono mais quer ver. Então o resumo é da ótica inteira; a UI avisa.
  void branchId;
  const convs = await prisma.whatsappConversation.findMany({
    where: { companyId, id: { in: convIds } },
    select: { id: true, needsHumanAttention: true },
  });

  // Última OUTBOUND por conversa (p/ decidir "respondida" = outbound após a última
  // inbound). Só das conversas em jogo.
  const lastOutbound = await prisma.whatsappMessage.groupBy({
    by: ["conversationId"],
    where: { companyId, direction: "outbound", conversationId: { in: convIds } },
    _max: { receivedAt: true },
  });
  const lastOutboundByConv = new Map<string, Date>();
  for (const g of lastOutbound) {
    if (g._max.receivedAt) lastOutboundByConv.set(g.conversationId, g._max.receivedAt);
  }

  let replied = 0;
  let awaiting = 0;
  let complaints = 0;
  for (const c of convs) {
    const lastIn = lastInboundByConv.get(c.id);
    if (!lastIn) continue;
    const lastOut = lastOutboundByConv.get(c.id);
    // Respondida = existe outbound com data >= a última inbound.
    if (lastOut && lastOut.getTime() >= lastIn.getTime()) replied++;
    else awaiting++;
    if (c.needsHumanAttention) complaints++;
  }

  return { conversations: convs.length, replied, awaiting, complaints };
}
