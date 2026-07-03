import { prisma } from "@/lib/prisma";
import { conversationAttentionTier, type AttentionTier } from "@/lib/conversation-attention";

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
  // Resultado da análise da IA (p/ o dono ver o porquê — inclusive não-lead).
  analysisIsLead: boolean | null;
  analysisIntent: string | null;
  analysisCustomerKind: string | null;
  analysisReason: string | null;
  // Guardrail SAGRADO (Item 1): true = precisa de humano AGORA e ainda não resolvido.
  needsHumanAttention: boolean;
  // Tier p/ o badge: "red" (reclamação/cobrança/irritado) > "soft" (garantia) > null.
  attentionTier: AttentionTier;
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
  opts?: { status?: InboxStatusFilter; includeGroups?: boolean; take?: number; includeArchived?: boolean },
): Promise<InboxConversation[]> {
  const status = opts?.status ?? "all";
  const take = Math.min(Math.max(opts?.take ?? DEFAULT_TAKE, 1), 200);

  const convs = await prisma.whatsappConversation.findMany({
    where: {
      companyId,
      ...(opts?.includeGroups ? {} : { isGroup: false }),
      // Troca de número: conversas arquivadas (do número antigo) saem do funil
      // ativo por padrão. includeArchived=true traz o histórico (aba "Arquivadas").
      ...(opts?.includeArchived ? {} : { archivedAt: null }),
      ...statusWhere(status),
    },
    // Os que precisam de atenção (e ainda não resolvidos) vêm PRIMEIRO — o guardrail
    // não pode ficar enterrado embaixo de conversas mais recentes. Depois, recência.
    orderBy: [{ needsHumanAttention: "desc" }, { lastMessageAt: "desc" }],
    take,
    select: {
      id: true,
      contactNumber: true,
      contactName: true,
      lastMessageAt: true,
      analyzedAt: true,
      needsAnalysis: true,
      leadId: true,
      analysisIsLead: true,
      analysisIntent: true,
      analysisIntentCode: true,
      analysisCustomerKind: true,
      analysisReason: true,
      needsHumanAttention: true,
      attentionResolvedAt: true,
      _count: { select: { messages: true } },
      messages: {
        where: { direction: "inbound" },
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: { text: true },
      },
    },
  });

  return convs.map((c) => {
    // Alarme ATIVO = acendido e ainda não resolvido por humano. Enquanto ativo, é
    // sempre "red" (o guardrail persistido já ORou urgent). Resolvido → derivamos
    // só o tier suave da intenção (garantia) p/ manter o marcador operacional.
    const live = c.needsHumanAttention && c.attentionResolvedAt == null;
    const attentionTier: AttentionTier = live
      ? "red"
      : conversationAttentionTier({ intent: c.analysisIntentCode });
    return {
      id: c.id,
      contactNumber: c.contactNumber,
      contactName: c.contactName,
      lastMessageAt: c.lastMessageAt,
      analyzedAt: c.analyzedAt,
      needsAnalysis: c.needsAnalysis,
      leadId: c.leadId,
      messageCount: c._count.messages,
      lastMessageText: c.messages[0]?.text ?? null,
      analysisIsLead: c.analysisIsLead,
      analysisIntent: c.analysisIntent,
      analysisCustomerKind: c.analysisCustomerKind,
      analysisReason: c.analysisReason,
      needsHumanAttention: live,
      attentionTier,
    };
  });
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
