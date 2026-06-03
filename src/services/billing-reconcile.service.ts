import { prisma } from "@/lib/prisma";
import { asaas, AsaasError } from "@/lib/asaas";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "billing-reconcile" });

/** Resultado da decisão de reconciliação de UMA subscription (parte pura). */
export type ReconcileDecision =
  | { action: "clear"; reason: "matched" }
  | { action: "keep"; reason: "value_mismatch" | "cycle_mismatch" | "asaas_not_active" };

interface AsaasSnapshot {
  status: "ACTIVE" | "EXPIRED" | "INACTIVE";
  value: number; // reais
  cycle: "MONTHLY" | "YEARLY";
}

interface ExpectedSnapshot {
  expectedAsaasValue: number | null; // centavos
  expectedAsaasCycle: "MONTHLY" | "YEARLY" | null;
}

/**
 * Decide o que fazer com uma subscription pendente, comparando o ESPERADO
 * materializado (centavos / ciclo) com o que o Asaas retornou. Função PURA.
 *
 * - Asaas não-ACTIVE → keep (cancelada/expirada lá; decisão humana via audit).
 * - value diverge (tolerância de centavo) → keep.
 * - cycle esperado setado e diverge → keep.
 * - tudo bate → clear (baixa a flag).
 */
export function decideReconcile(expected: ExpectedSnapshot, asaasSub: AsaasSnapshot): ReconcileDecision {
  if (asaasSub.status !== "ACTIVE") {
    return { action: "keep", reason: "asaas_not_active" };
  }
  const asaasCents = Math.round(asaasSub.value * 100);
  if (expected.expectedAsaasValue !== null && asaasCents !== expected.expectedAsaasValue) {
    return { action: "keep", reason: "value_mismatch" };
  }
  if (expected.expectedAsaasCycle !== null && asaasSub.cycle !== expected.expectedAsaasCycle) {
    return { action: "keep", reason: "cycle_mismatch" };
  }
  return { action: "clear", reason: "matched" };
}

export interface ReconcileSummary {
  processed: number;
  cleared: number;
  kept: number;
  errors: number;
}

/**
 * Reconcilia subscriptions com billingSyncPending=true contra o Asaas.
 * Idempotente, fail-soft por item (uma falha não derruba o lote).
 */
export async function reconcilePendingBilling(opts: { limit?: number } = {}): Promise<ReconcileSummary> {
  const limit = Math.min(opts.limit ?? 100, 500);

  const pending = await prisma.subscription.findMany({
    where: { billingSyncPending: true, asaasSubscriptionId: { not: null } },
    select: {
      id: true,
      companyId: true,
      asaasSubscriptionId: true,
      expectedAsaasValue: true,
      expectedAsaasCycle: true,
    },
    take: limit,
  });

  const summary: ReconcileSummary = { processed: 0, cleared: 0, kept: 0, errors: 0 };

  for (const sub of pending) {
    summary.processed++;
    try {
      const asaasSub = await asaas.subscriptions.get(sub.asaasSubscriptionId as string);
      const decision = decideReconcile(
        { expectedAsaasValue: sub.expectedAsaasValue, expectedAsaasCycle: sub.expectedAsaasCycle },
        { status: asaasSub.status, value: asaasSub.value, cycle: asaasSub.cycle }
      );

      if (decision.action === "clear") {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { billingSyncPending: false, expectedAsaasValue: null, expectedAsaasCycle: null },
        });
        summary.cleared++;
        await prisma.globalAudit.create({
          data: {
            actorType: "SYSTEM",
            action: "BILLING_RECONCILE_CLEARED",
            companyId: sub.companyId,
            metadata: {
              subscriptionId: sub.id,
              asaasValue: asaasSub.value,
              asaasCycle: asaasSub.cycle,
            },
          },
        }).catch(() => {});
      } else {
        summary.kept++;
        await prisma.globalAudit.create({
          data: {
            actorType: "SYSTEM",
            action: "BILLING_RECONCILE_DIVERGENCE",
            companyId: sub.companyId,
            metadata: {
              subscriptionId: sub.id,
              reason: decision.reason,
              expectedValue: sub.expectedAsaasValue,
              expectedCycle: sub.expectedAsaasCycle,
              asaasStatus: asaasSub.status,
              asaasValue: asaasSub.value,
              asaasCycle: asaasSub.cycle,
            },
          },
        }).catch(() => {});
      }
    } catch (err) {
      summary.errors++;
      // 404 = subscription removida no Asaas; mantém flag + audita.
      const is404 = err instanceof AsaasError && err.status === 404;
      log.error("Falha ao reconciliar subscription", {
        subscriptionId: sub.id,
        is404,
        error: err instanceof Error ? err.message : String(err),
      });
      await prisma.globalAudit.create({
        data: {
          actorType: "SYSTEM",
          action: "BILLING_RECONCILE_ERROR",
          companyId: sub.companyId,
          metadata: {
            subscriptionId: sub.id,
            is404,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      }).catch(() => {});
    }
  }

  return summary;
}
