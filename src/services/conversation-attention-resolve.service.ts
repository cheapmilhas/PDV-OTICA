import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "conversation-attention-resolve" });

/**
 * Baixa HUMANA do guardrail de atenção (Item 1). O sinal `needsHumanAttention` é
 * MONOTÔNICO-PRA-CIMA no fluxo da IA (a re-qualificação nunca apaga) — a ÚNICA
 * forma de apagá-lo é esta ação humana explícita, gravando quem/quando (trilha de
 * auditoria do R$50k: "a reclamação foi de fato tratada?").
 *
 * Multi-tenant: valida que a conversa é da empresa antes de tocar. Retorna null
 * quando não é da empresa / não existe (a rota traduz p/ 404); true no sucesso.
 */
export async function resolveConversationAttention(
  companyId: string,
  conversationId: string,
  userId: string,
): Promise<true | null> {
  const conv = await prisma.whatsappConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, companyId: true },
  });
  if (!conv || conv.companyId !== companyId) return null;

  await prisma.whatsappConversation.update({
    where: { id: conversationId },
    data: {
      needsHumanAttention: false,
      attentionResolvedAt: new Date(),
      attentionResolvedById: userId,
    },
  });
  log.info("guardrail de atenção resolvido por humano", { conversationId, companyId, userId });
  return true;
}
