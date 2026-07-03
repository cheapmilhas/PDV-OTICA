import { prisma } from "@/lib/prisma";

/**
 * IDs de leads cuja CONVERSA de WhatsApp está ARQUIVADA (número antigo da loja).
 *
 * A troca de número da loja arquiva as conversas do número anterior
 * (WhatsappConversation.archivedAt). Um Lead nasceu daquela conversa via
 * WhatsappConversation.leadId (coluna crua, não é relação Prisma), então para
 * excluir do funil ativo os leads do número antigo, buscamos os leadIds das
 * conversas arquivadas e usamos `id: { notIn }`.
 *
 * Leads SEM conversa (criados manualmente/admin) não são afetados — só entram
 * aqui os que têm uma conversa arquivada apontando para eles.
 *
 * Escopado por companyId (multi-tenant). Retorna [] quando não há nada arquivado
 * (caminho comum) — o caller pode pular o filtro `notIn` nesse caso.
 */
export async function getArchivedLeadIds(companyId: string): Promise<string[]> {
  const rows = await prisma.whatsappConversation.findMany({
    where: { companyId, archivedAt: { not: null }, leadId: { not: null } },
    select: { leadId: true },
  });
  // leadId é string | null aqui, mas o where garante not-null.
  return rows.map((r) => r.leadId as string);
}
