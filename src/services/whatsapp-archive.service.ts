import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "whatsapp-archive" });

/**
 * Arquivamento de conversas do WhatsApp na TROCA DE NÚMERO da loja.
 *
 * Ao trocar o número, as conversas do número ANTIGO não podem mais ser
 * respondidas por ali. Este serviço as tira do funil ativo (inbox/Recuperar/
 * filas) marcando WhatsappConversation.archivedAt, SEM apagar nada (histórico/
 * LGPD preservados). Reversível via unarchive.
 *
 * O corte (cutoff) padrão é o momento da TROCA REAL de número
 * (WhatsappConnection.numberChangedAt) — NÃO connectedAt, que é regravado em
 * toda reconexão (queda de sinal) e arquivaria o funil ativo inteiro por engano.
 * Conversas cuja última mensagem é ANTERIOR à troca pertencem ao número antigo.
 * O dono pode passar um cutoff explícito.
 *
 * Multi-tenant: sempre escopado por companyId. Backfill em LOTE (updateMany).
 */

export interface ArchiveResult {
  archived: number;
  cutoff: string | null; // ISO; null = nada a arquivar (sem conexão/data)
}

/**
 * Quantas conversas ATIVAS seriam arquivadas com o cutoff atual (preview p/ a UI
 * confirmar antes de agir). Não muda nada.
 */
export async function previewArchiveOldNumber(
  companyId: string,
  cutoffOverride?: Date,
): Promise<ArchiveResult> {
  const cutoff = await resolveCutoff(companyId, cutoffOverride);
  if (!cutoff) return { archived: 0, cutoff: null };

  const count = await prisma.whatsappConversation.count({
    where: { companyId, archivedAt: null, lastMessageAt: { lt: cutoff } },
  });
  return { archived: count, cutoff: cutoff.toISOString() };
}

/**
 * Arquiva EM LOTE as conversas do número antigo (lastMessageAt < cutoff, ainda
 * ativas). Idempotente: rodar de novo não re-arquiva o que já está arquivado.
 */
export async function archiveOldNumberConversations(
  companyId: string,
  cutoffOverride?: Date,
): Promise<ArchiveResult> {
  const cutoff = await resolveCutoff(companyId, cutoffOverride);
  if (!cutoff) return { archived: 0, cutoff: null };

  const now = new Date();
  const res = await prisma.whatsappConversation.updateMany({
    where: { companyId, archivedAt: null, lastMessageAt: { lt: cutoff } },
    data: { archivedAt: now },
  });
  log.info("Conversas do número antigo arquivadas", {
    companyId,
    archived: res.count,
    cutoff: cutoff.toISOString(),
  });
  return { archived: res.count, cutoff: cutoff.toISOString() };
}

export interface ArchivedBatch {
  archivedAt: string; // ISO — o timestamp comum da leva (chave de agrupamento)
  count: number;
}

/**
 * Lista as LEVAS de arquivamento (cada troca de número gera um lote com o mesmo
 * archivedAt). Permite ao dono desarquivar só uma leva específica em vez de
 * tudo. Mais recente primeiro.
 */
export async function listArchivedBatches(companyId: string): Promise<ArchivedBatch[]> {
  const grouped = await prisma.whatsappConversation.groupBy({
    by: ["archivedAt"],
    where: { companyId, archivedAt: { not: null } },
    _count: { _all: true },
  });
  return grouped
    .filter((g) => g.archivedAt != null)
    .map((g) => ({ archivedAt: (g.archivedAt as Date).toISOString(), count: g._count._all }))
    .sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1));
}

/**
 * Desarquiva (reverte) — devolve conversas ao funil ativo.
 *
 * Sem batchArchivedAt: reabre TODAS as arquivadas da empresa (escapatória
 * ampla). Com batchArchivedAt: reabre só a LEVA daquele timestamp — evita que
 * desarquivar uma troca recente reabra arquivamentos antigos e intencionais.
 */
export async function unarchiveConversations(
  companyId: string,
  batchArchivedAt?: Date,
): Promise<{ unarchived: number }> {
  const where = batchArchivedAt
    ? { companyId, archivedAt: batchArchivedAt }
    : { companyId, archivedAt: { not: null } };
  const res = await prisma.whatsappConversation.updateMany({
    where,
    data: { archivedAt: null },
  });
  log.info("Conversas desarquivadas", {
    companyId,
    unarchived: res.count,
    batch: batchArchivedAt?.toISOString() ?? "TODAS",
  });
  return { unarchived: res.count };
}

/**
 * Resolve o corte: override explícito, senão o numberChangedAt (última troca
 * REAL de número). Retorna null quando nunca houve troca registrada — nesse caso
 * não arquivamos nada (fail-safe: reconexão do mesmo número não vira corte, e
 * não escondemos conversas por engano).
 */
async function resolveCutoff(companyId: string, override?: Date): Promise<Date | null> {
  if (override) return override;
  const conn = await prisma.whatsappConnection.findUnique({
    where: { companyId },
    select: { numberChangedAt: true },
  });
  return conn?.numberChangedAt ?? null;
}
