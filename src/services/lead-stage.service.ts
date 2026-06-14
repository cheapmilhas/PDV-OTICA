import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const DEFAULT_LEAD_STAGES = [
  { name: "Novo", order: 0, isWon: false, isLost: false },
  { name: "Em atendimento", order: 1, isWon: false, isLost: false },
  { name: "Orçamento enviado", order: 2, isWon: false, isLost: false },
  { name: "Fechado", order: 3, isWon: true, isLost: false },
  { name: "Perdido", order: 4, isWon: false, isLost: true },
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
  return prisma.leadStage.create({ data: { ...data, companyId } });
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
