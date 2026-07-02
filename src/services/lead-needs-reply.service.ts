import { prisma } from "@/lib/prisma";

/**
 * "Precisa responder" (Item 5, sinal AFIADO do SLA): p/ um conjunto de leads
 * ABERTOS, decide em quais a BOLA ESTÁ COM A ÓTICA — o cliente engajou mas a
 * ótica ainda NÃO respondeu (sem mensagem outbound na conversa). É o lead que
 * realmente precisa de um humano AGORA (≠ do SLA por tempo, que só mede staleness).
 *
 * Retorna um Map leadId → `waitingSince` (Sprint 2, #5 — laço fechado pelo fluxo
 * real): o instante da mensagem do CLIENTE a partir do qual ele espera sem
 * resposta. É o RELÓGIO real do semáforo — o tempo que o cliente está esperando
 * conta desde que ELE escreveu, não desde o último movimento do card
 * (`Lead.lastActivityAt`, que nem muda com mensagem de WhatsApp). Leads sem
 * conversa (ou já respondidos) ficam FORA do Map (sinal indisponível → o SLA os
 * trata como undefined, não como false).
 *
 * Quando o lead tem mais de uma conversa aberta sem resposta, `waitingSince` é a
 * inbound MAIS ANTIGA entre elas — a pior espera é a que dói (e a que perde a venda).
 *
 * Multi-tenant: companyId obrigatório em todas as queries. Custo: 3 queries
 * agregadas (conversas + existência de outbound + max inbound), nenhuma carrega
 * texto de mensagem. Escopo restrito aos leadIds passados (só abertos).
 */
export async function computeNeedsReplyLeadIds(
  companyId: string,
  openLeadIds: ReadonlyArray<string>,
): Promise<Map<string, Date>> {
  const needsReply = new Map<string, Date>();
  if (openLeadIds.length === 0) return needsReply;

  // Conversas (da empresa) vinculadas a esses leads. Uma conversa por lead no
  // caso normal; se houver mais de uma, qualquer uma com outbound já "respondeu".
  const convs = await prisma.whatsappConversation.findMany({
    where: { companyId, leadId: { in: [...openLeadIds] } },
    select: { id: true, leadId: true },
  });
  if (convs.length === 0) return needsReply;

  const convIds = convs.map((c) => c.id);
  // Conversas que TÊM ao menos uma mensagem outbound (a ótica respondeu). groupBy
  // sobre WhatsappMessage é barato (usa índice conversationId) e não traz texto.
  const withOutbound = await prisma.whatsappMessage.groupBy({
    by: ["conversationId"],
    where: { companyId, conversationId: { in: convIds }, direction: "outbound" },
    _count: { _all: true },
  });
  const repliedConvIds = new Set(withOutbound.map((g) => g.conversationId));

  // Conversas do lead que AINDA aguardam resposta (nenhum outbound). Só delas
  // precisamos do relógio — a última inbound é quando o cliente escreveu por último.
  const pendingConvIds = convIds.filter((id) => !repliedConvIds.has(id));
  if (pendingConvIds.length === 0) return needsReply;

  // Relógio real (#5): a última mensagem do CLIENTE (inbound) por conversa pendente.
  // Como a conversa não tem outbound, essa inbound continua sem resposta → é desde
  // ela que o cliente espera. _max(receivedAt) usa o índice (conversationId, receivedAt).
  const lastInbound = await prisma.whatsappMessage.groupBy({
    by: ["conversationId"],
    where: { companyId, conversationId: { in: pendingConvIds }, direction: "inbound" },
    _max: { receivedAt: true },
  });
  const inboundAtByConv = new Map<string, Date>();
  for (const g of lastInbound) {
    if (g._max.receivedAt) inboundAtByConv.set(g.conversationId, g._max.receivedAt);
  }

  // Agrupa por lead: waitingSince = a inbound MAIS ANTIGA entre as conversas
  // pendentes do lead (a maior espera — a que mais dói e mais arrisca a venda).
  // Estar no Map = "precisa responder" (o flag) E o relógio da espera, juntos.
  //
  // Uma conversa pendente SEM inbound com timestamp não entra. Na prática isso não
  // acontece: toda conversa nasce de persistInboundMessage (grava uma inbound) e
  // WhatsappMessage.receivedAt é @default(now()) (nunca null) — logo toda pendente
  // tem ao menos uma inbound datada. O guarda `!at` é defensivo, não um caminho vivo.
  for (const c of convs) {
    if (!c.leadId) continue;
    if (repliedConvIds.has(c.id)) continue; // essa conversa já foi respondida
    const at = inboundAtByConv.get(c.id);
    if (!at) continue; // defensivo (ver acima): sem timestamp não há relógio a dar
    const current = needsReply.get(c.leadId);
    if (!current || at < current) needsReply.set(c.leadId, at);
  }
  return needsReply;
}
