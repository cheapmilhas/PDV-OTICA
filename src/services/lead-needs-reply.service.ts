import { prisma } from "@/lib/prisma";

/**
 * "Precisa responder" (Item 5, sinal AFIADO do SLA): p/ um conjunto de leads
 * ABERTOS, decide em quais a BOLA ESTÁ COM A ÓTICA — o cliente engajou mas a
 * ótica ainda NÃO respondeu (sem mensagem outbound na conversa). É o lead que
 * realmente precisa de um humano AGORA (≠ do SLA por tempo, que só mede staleness).
 *
 * Multi-tenant: companyId obrigatório. Só olha conversas DA empresa. Retorna um
 * Set de leadIds que "precisam responder"; leads sem conversa de WhatsApp ficam
 * FORA (sinal indisponível → o SLA os trata como undefined, não como false).
 *
 * Custo: 2 queries agregadas (conversas dos leads + existência de outbound), NÃO
 * carrega mensagens. Escopo restrito aos leadIds passados (só abertos).
 */
export async function computeNeedsReplyLeadIds(
  companyId: string,
  openLeadIds: ReadonlyArray<string>,
): Promise<Set<string>> {
  const needsReply = new Set<string>();
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

  // Um lead "precisa responder" se TEM conversa e NENHUMA dela tem outbound.
  // Agrupa por leadId: se qualquer conversa do lead já respondeu, o lead sai.
  const byLead = new Map<string, { hasConv: boolean; replied: boolean }>();
  for (const c of convs) {
    if (!c.leadId) continue;
    const e = byLead.get(c.leadId) ?? { hasConv: false, replied: false };
    e.hasConv = true;
    if (repliedConvIds.has(c.id)) e.replied = true;
    byLead.set(c.leadId, e);
  }
  for (const [leadId, e] of byLead) {
    if (e.hasConv && !e.replied) needsReply.add(leadId);
  }
  return needsReply;
}
