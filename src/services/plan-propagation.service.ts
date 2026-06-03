import { prisma } from "@/lib/prisma";
import { invalidatePlanFeaturesCache } from "@/lib/plan-features-cache";

/** Status de assinatura "viva" — espelha plan-limits.ts (enforcement). */
export const LIVE_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE"] as const;

/** Subscription mínima para decidir o "plano efetivo" de uma empresa. */
export interface SubForEffectivePlan {
  companyId: string;
  planId: string;
  createdAt: Date;
}

/**
 * Dada uma lista de subscriptions VIVAS (já filtradas por status), retorna os
 * companyIds cuja subscription MAIS RECENTE (maior createdAt) é do plano dado.
 *
 * Função pura (testável). Espelha a regra de `plan-limits.ts`: o plano efetivo de
 * uma empresa é o da subscription viva mais recente — NÃO basta ter `some` no
 * plano (a empresa pode ter migrado e ter subscription antiga no plano editado).
 */
export function companyIdsWithEffectivePlan(
  liveSubs: SubForEffectivePlan[],
  planId: string
): string[] {
  const latestByCompany = new Map<string, SubForEffectivePlan>();
  for (const sub of liveSubs) {
    const current = latestByCompany.get(sub.companyId);
    if (!current || sub.createdAt.getTime() > current.createdAt.getTime()) {
      latestByCompany.set(sub.companyId, sub);
    }
  }
  const result: string[] = [];
  for (const [companyId, sub] of latestByCompany) {
    if (sub.planId === planId) result.push(companyId);
  }
  return result;
}

/**
 * Propaga os limites de um plano para as empresas cujo plano efetivo é ele.
 * Atualiza Company.maxUsers/maxBranches/maxProducts (cache/cópia) e invalida o
 * cache de features de cada empresa afetada.
 *
 * NÃO roda dentro da transação das features (M4): é cache, será invalidado de
 * qualquer forma, e um updateMany grande na tx interativa seguraria a conexão no
 * pooler Neon. A invalidação é best-effort local por lambda + TTL 5min.
 *
 * Retorna a quantidade de empresas afetadas (para auditoria).
 */
export async function propagatePlanLimits(
  planId: string,
  limits: { maxUsers: number; maxBranches: number; maxProducts: number }
): Promise<number> {
  const liveSubs = await prisma.subscription.findMany({
    where: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
    select: { companyId: true, planId: true, createdAt: true },
  });

  const companyIds = companyIdsWithEffectivePlan(liveSubs, planId);
  if (companyIds.length === 0) return 0;

  await prisma.company.updateMany({
    where: { id: { in: companyIds } },
    data: {
      maxUsers: limits.maxUsers,
      maxBranches: limits.maxBranches,
      maxProducts: limits.maxProducts,
    },
  });

  for (const companyId of companyIds) {
    invalidatePlanFeaturesCache(companyId);
  }

  return companyIds.length;
}
