import Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import type { CommissionTiersDTO } from "@/lib/validations/commission-tier.schema";

/**
 * Serviço da configuração de metas por níveis (mini/meta/mega) — Comissão Fase 2.
 *
 * Lê/grava em SellerCommissionTier (Fase 1). NÃO toca em CommissionConfig,
 * Commission, SellerCommission nem nos cálculos antigos. NÃO chama o motor.
 *
 * Escopo: tudo por companyId (espelha a tabela e o motor).
 *  - userId = null  → metas PADRÃO da loja.
 *  - userId = <id>  → OVERRIDE de um vendedor.
 *
 * decimal.js para normalizar dinheiro/percentual (2 casas) antes de persistir.
 */

const LEVELS = ["MINI", "META", "MEGA"] as const;
type Level = (typeof LEVELS)[number];

function money(value: number | string): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export interface TierLevelView {
  targetAmount: string;
  percent: string;
}

export interface CommissionTiersView {
  /** null = padrão da loja; preenchido = override do vendedor. */
  userId: string | null;
  mini: TierLevelView | null;
  meta: TierLevelView | null;
  mega: TierLevelView | null;
}

/**
 * Lê as metas de um escopo (loja inteira se userId null, ou um vendedor).
 * Retorna cada nível ou null se ainda não configurado.
 */
export async function getCommissionTiers(
  companyId: string,
  userId: string | null
): Promise<CommissionTiersView> {
  const rows = await prisma.sellerCommissionTier.findMany({
    where: { companyId, userId: userId ?? null },
    select: { level: true, targetAmount: true, percent: true },
  });

  const byLevel = (level: Level): TierLevelView | null => {
    const r = rows.find((x) => x.level === level);
    return r
      ? { targetAmount: money(r.targetAmount.toString()), percent: money(r.percent.toString()) }
      : null;
  };

  return {
    userId: userId ?? null,
    mini: byLevel("MINI"),
    meta: byLevel("META"),
    mega: byLevel("MEGA"),
  };
}

/** Lista os escopos de OVERRIDE já configurados (vendedores com metas próprias). */
export async function listConfiguredOverrides(companyId: string): Promise<string[]> {
  const rows = await prisma.sellerCommissionTier.findMany({
    where: { companyId, userId: { not: null } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.map((r) => r.userId).filter((id): id is string => id !== null);
}

/**
 * Grava (upsert) os 3 níveis de um escopo. Idempotente. Usa o índice único
 * (companyId, userId, level) — e, para o default (userId null), o índice
 * parcial garante 1 linha por nível.
 */
export async function saveCommissionTiers(
  companyId: string,
  data: CommissionTiersDTO
): Promise<CommissionTiersView> {
  const userId = data.userId ?? null;
  const levelData: Record<Level, { targetAmount: string; percent: string }> = {
    MINI: { targetAmount: money(data.mini.targetAmount), percent: money(data.mini.percent) },
    META: { targetAmount: money(data.meta.targetAmount), percent: money(data.meta.percent) },
    MEGA: { targetAmount: money(data.mega.targetAmount), percent: money(data.mega.percent) },
  };

  await prisma.$transaction(async (tx) => {
    for (const level of LEVELS) {
      const existing = await tx.sellerCommissionTier.findFirst({
        where: { companyId, userId, level },
        select: { id: true },
      });
      if (existing) {
        await tx.sellerCommissionTier.update({
          where: { id: existing.id },
          data: { targetAmount: levelData[level].targetAmount, percent: levelData[level].percent },
        });
      } else {
        await tx.sellerCommissionTier.create({
          data: {
            companyId,
            userId,
            level,
            targetAmount: levelData[level].targetAmount,
            percent: levelData[level].percent,
          },
        });
      }
    }
  });

  return getCommissionTiers(companyId, userId);
}

/** Remove o override de um vendedor (volta a usar o padrão da loja). */
export async function deleteCommissionTiers(companyId: string, userId: string): Promise<void> {
  await prisma.sellerCommissionTier.deleteMany({ where: { companyId, userId } });
}
