import { prisma } from "@/lib/prisma";
import type { InboundMessage } from "@/lib/validations/whatsapp-inbound";

export async function persistInboundMessage(
  companyId: string,
  msg: InboundMessage
): Promise<{ created: boolean; conversationId?: string; messageId?: string }> {
  // Idempotência: se já temos esta mensagem (mesmo evolutionId), no-op.
  if (msg.evolutionId) {
    const existing = await prisma.whatsappMessage.findUnique({
      where: { evolutionId: msg.evolutionId },
      select: { id: true },
    });
    if (existing) return { created: false };
  }

  const conversation = await prisma.whatsappConversation.upsert({
    where: { companyId_contactNumber: { companyId, contactNumber: msg.contactNumber } },
    update: {
      lastMessageAt: msg.receivedAt,
      contactName: msg.contactName ?? undefined,
      isGroup: msg.isGroup,
    },
    create: {
      companyId,
      contactNumber: msg.contactNumber,
      contactName: msg.contactName,
      lastMessageAt: msg.receivedAt,
      isGroup: msg.isGroup,
    },
    select: { id: true, analyzedAt: true },
  });

  const newMessage = await prisma.whatsappMessage.create({
    data: {
      conversationId: conversation.id,
      companyId,
      direction: msg.direction,
      type: msg.type,
      text: msg.text,
      mediaUrl: msg.mediaUrl,
      evolutionId: msg.evolutionId || null,
      receivedAt: msg.receivedAt,
    },
    select: { id: true },
  });

  // R1: msg nova numa conversa JÁ analisada → marcar p/ re-qualificação. SÓ
  // inbound: uma resposta NOSSA (outbound) não é motivo de re-analisar o lead.
  if (conversation.analyzedAt && msg.direction === "inbound") {
    await prisma.whatsappConversation.update({
      where: { id: conversation.id },
      data: { needsAnalysis: true },
    });
  }

  return { created: true, conversationId: conversation.id, messageId: newMessage.id };
}
