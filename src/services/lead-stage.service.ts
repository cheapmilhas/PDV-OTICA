import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";

export const DEFAULT_LEAD_STAGES = [
  { name: "Novo", order: 0, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Em atendimento", order: 1, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Exame agendado", order: 2, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Exame feito", order: 3, isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE as string | null },
  { name: "Orçamento enviado", order: 4, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Aguardando OS/lab", order: 5, isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Fechado", order: 6, isWon: true, isLost: false, systemKey: null as string | null },
  { name: "Perdido", order: 7, isWon: false, isLost: true, systemKey: null as string | null },
] as const;

/** Aditivo + idempotente: cria as etapas padrão só se a empresa não tem nenhuma. Retorna nº criado. */
export async function ensureDefaultStages(
  companyId: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? prisma;
  const existing = await client.leadStage.count({ where: { companyId } });
  if (existing > 0) return 0;
  const res = await client.leadStage.createMany({
    data: DEFAULT_LEAD_STAGES.map((s) => ({ ...s, companyId })),
  });
  return res.count;
}

export async function listStages(companyId: string) {
  return prisma.leadStage.findMany({ where: { companyId }, orderBy: { order: "asc" } });
}

export async function createStage(
  companyId: string,
  data: { name: string; order: number; isWon?: boolean; isLost?: boolean }
) {
  return prisma.$transaction(async (tx) => {
    // Abre espaço: empurra +1 todo estágio da empresa com order >= o pedido, p/
    // que a nova coluna não colida no order (order não é único; a colisão deixaria
    // a posição no board ambígua). Espelha a lógica de ensureOpticalStages.
    await tx.leadStage.updateMany({
      where: { companyId, order: { gte: data.order } },
      data: { order: { increment: 1 } },
    });
    return tx.leadStage.create({ data: { ...data, companyId } });
  });
}

export async function updateStage(
  id: string,
  companyId: string,
  data: { name?: string; order?: number; isWon?: boolean; isLost?: boolean }
) {
  // garante isolamento por empresa
  const stage = await prisma.leadStage.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!stage) throw new Error("Etapa não encontrada");
  return prisma.leadStage.update({ where: { id }, data });
}

/** Bloqueia apagar etapa terminal ou com leads dentro. */
export async function deleteStage(id: string, companyId: string) {
  const stage = await prisma.leadStage.findFirst({ where: { id, companyId } });
  if (!stage) throw new Error("Etapa não encontrada");
  if (stage.isWon || stage.isLost) throw new Error("Não é possível apagar etapas Fechado/Perdido");
  const leadsInStage = await prisma.lead.count({ where: { stageId: id, deletedAt: null } });
  if (leadsInStage > 0) throw new Error("Mova os leads desta etapa antes de apagá-la");
  await prisma.leadStage.delete({ where: { id } });
}

/** As 3 colunas de ótica que uma ótica legada (funil de 5) ainda não tem. */
const OPTICAL_STAGES = [
  { name: "Exame agendado", isWon: false, isLost: false, systemKey: null as string | null },
  { name: "Exame feito", isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE as string | null },
  { name: "Aguardando OS/lab", isWon: false, isLost: false, systemKey: null as string | null },
] as const;

/**
 * Aditivo + idempotente: garante que a ótica tem as 3 colunas de ótica. As
 * colunas novas entram ANTES das terminais (Fechado/Perdido), na ordem a partir
 * do menor `order` terminal, para o funil ficar coerente esquerda→direita (o
 * board ordena por `order` asc). Preserva a ordem RELATIVA de todas as colunas
 * existentes: as com order < insertAt ficam intactas; TODAS as com order >=
 * insertAt (terminais E qualquer coluna que o dono tenha criado depois delas —
 * ex.: "Garantia") são empurradas para cima em bloco, sem colidir. Retorna nº
 * criado.
 * Existência é casada POR NOME — as duas colunas sem flag (Exame agendado,
 * Aguardando OS/lab) dependem de nome único; só "Exame feito" tem a flag estável
 * EXAM_DONE. Create + shift são atômicos ($transaction).
 * Multi-tenant: companyId em todo filtro e no createMany.
 *
 * Tradeoff aceito: a existência é por NOME e a inserção é em bloco (antes dos
 * terminais). Se uma ótica já tiver ALGUMA das 3 colunas de ótica posicionada
 * fora da ordem canônica, as novas entram em bloco antes dos terminais e podem
 * não ficar em ordem perfeita de negócio em relação a ela — sem colisão de
 * order, só estético. Cenário raríssimo (exige a coluna ter sido criada
 * manualmente fora de ordem antes desta feature). Se virar problema real,
 * ancorar insertAt por-coluna.
 */
export async function ensureOpticalStages(companyId: string): Promise<number> {
  const existing = await prisma.leadStage.findMany({
    where: { companyId },
    select: { id: true, name: true, order: true, isWon: true, isLost: true, systemKey: true },
  });
  const existingNames = new Set(existing.map((s) => s.name));
  const hasExamDoneKey = existing.some((s) => s.systemKey === LEAD_STAGE_KEYS.EXAM_DONE);

  const missing = OPTICAL_STAGES.filter((s) => !existingNames.has(s.name));
  if (missing.length === 0) return 0;

  // Ponto de inserção = a primeira coluna terminal (Fechado/Perdido). Sem
  // terminais (defensivo — não deve acontecer), anexa ao fim (maior order + 1).
  const terminals = existing.filter((s) => s.isWon || s.isLost);
  const insertAt = terminals.length
    ? Math.min(...terminals.map((s) => s.order))
    : existing.reduce((m, s) => Math.max(m, s.order), -1) + 1;

  const toCreate = missing.map((s, i) => ({
    name: s.name,
    isWon: s.isWon,
    isLost: s.isLost,
    // Não duplica a flag EXAM_DONE se a ótica já tem um estágio com ela (evita
    // colisão do índice único parcial (companyId, systemKey)).
    systemKey: s.systemKey === LEAD_STAGE_KEYS.EXAM_DONE && hasExamDoneKey ? null : s.systemKey,
    order: insertAt + i,
    companyId,
  }));

  // Empurra TODA coluna com order >= insertAt (terminais E qualquer coluna que o
  // dono tenha parado depois delas) para abrir um vão contíguo — preserva a ordem
  // relativa de todas. Colunas com order < insertAt ficam intactas.
  const toShift = existing.filter((s) => s.order >= insertAt);

  const res = await prisma.$transaction(async (tx) => {
    for (const s of toShift) {
      await tx.leadStage.update({
        where: { id: s.id },
        data: { order: s.order + toCreate.length },
      });
    }
    return tx.leadStage.createMany({ data: toCreate, skipDuplicates: true });
  });
  return res.count;
}
