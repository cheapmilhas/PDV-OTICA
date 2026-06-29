import { prisma } from "@/lib/prisma";

/**
 * Leitura do inbox de conversas de WhatsApp para a tela do Funil (aba "Conversas").
 * SEMPRE escopado por companyId (multi-tenant). Apenas leitura.
 */

export type InboxStatusFilter = "pending" | "analyzed" | "all";

export interface InboxConversation {
  id: string;
  contactNumber: string;
  contactName: string | null;
  lastMessageAt: Date;
  analyzedAt: Date | null;
  needsAnalysis: boolean;
  leadId: string | null;
  messageCount: number;
  lastMessageText: string | null;
}

export interface InboxMessage {
  id: string;
  direction: string;
  type: string;
  text: string | null;
  receivedAt: Date;
}

const DEFAULT_TAKE = 50;
const MESSAGES_TAKE = 100;

/**
 * Constrói o WHERE de status. "pending" = ainda não concluída pela IA
 * (analyzedAt null OU precisa re-analisar). "analyzed" = já concluída e estável.
 */
function statusWhere(status: InboxStatusFilter) {
  if (status === "pending") {
    return { OR: [{ analyzedAt: null }, { needsAnalysis: true }] };
  }
  if (status === "analyzed") {
    return { analyzedAt: { not: null }, needsAnalysis: false };
  }
  return {};
}

/**
 * Lista conversas 1:1 (exclui grupos por padrão) da empresa, mais recentes primeiro.
 */
export async function listInboxConversations(
  companyId: string,
  opts?: { status?: InboxStatusFilter; includeGroups?: boolean; take?: number },
): Promise<InboxConversation[]> {
  const status = opts?.status ?? "all";
  const take = Math.min(Math.max(opts?.take ?? DEFAULT_TAKE, 1), 200);

  const convs = await prisma.whatsappConversation.findMany({
    where: {
      companyId,
      ...(opts?.includeGroups ? {} : { isGroup: false }),
      ...statusWhere(status),
    },
    orderBy: { lastMessageAt: "desc" },
    take,
    select: {
      id: true,
      contactNumber: true,
      contactName: true,
      lastMessageAt: true,
      analyzedAt: true,
      needsAnalysis: true,
      leadId: true,
      _count: { select: { messages: true } },
      messages: {
        where: { direction: "inbound" },
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: { text: true },
      },
    },
  });

  return convs.map((c) => ({
    id: c.id,
    contactNumber: c.contactNumber,
    contactName: c.contactName,
    lastMessageAt: c.lastMessageAt,
    analyzedAt: c.analyzedAt,
    needsAnalysis: c.needsAnalysis,
    leadId: c.leadId,
    messageCount: c._count.messages,
    lastMessageText: c.messages[0]?.text ?? null,
  }));
}

/**
 * Lê a thread de mensagens de UMA conversa, tenant-guarded.
 * Lança (retorna null) se a conversa não for da empresa — a rota traduz p/ 404.
 */
export async function getConversationMessages(
  companyId: string,
  conversationId: string,
  opts?: { take?: number },
): Promise<InboxMessage[] | null> {
  const conv = await prisma.whatsappConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, companyId: true },
  });
  if (!conv || conv.companyId !== companyId) return null;

  const take = Math.min(Math.max(opts?.take ?? MESSAGES_TAKE, 1), 300);
  const messages = await prisma.whatsappMessage.findMany({
    where: { conversationId },
    orderBy: { receivedAt: "asc" },
    take,
    select: { id: true, direction: true, type: true, text: true, receivedAt: true },
  });
  return messages;
}
