// src/lib/monitoring/client-health-snapshot.ts
//
// Saúde dos CLIENTES (Fase 4 do cockpit, coluna direita): MRR em risco,
// inadimplência e distribuição de health score da base. NÃO recalcula health score
// — lê Company.healthCategory (já mantido por src/lib/health-score.ts + cron).
// Reusa monthlyValueOfSubscription de admin-metrics (fonte única de cálculo de MRR).
import { prisma } from "@/lib/prisma";
import {
  monthlyValueOfSubscription,
  type SubscriptionForMRR,
} from "@/lib/admin-metrics";
import type { HealthCategory, SubscriptionStatus, InvoiceStatus } from "@prisma/client";

// ─── MRR em risco ─────────────────────────────────────────────────────────────

/** Status considerados "em risco de receita" (caller passa todos; filtramos aqui). */
const AT_RISK_STATUS: SubscriptionStatus[] = ["PAST_DUE", "SUSPENDED"];

export interface SubscriptionAtRisk extends SubscriptionForMRR {
  status: SubscriptionStatus;
}

export interface MrrAtRisk {
  mrrAtRiskCents: number;
  atRiskCount: number;
}

/**
 * Soma o valor mensal efetivo das assinaturas em risco (PAST_DUE/SUSPENDED) — pura.
 */
export function computeMrrAtRisk(subs: SubscriptionAtRisk[], now: Date): MrrAtRisk {
  const atRisk = subs.filter((s) => AT_RISK_STATUS.includes(s.status));
  const mrrAtRiskCents = atRisk.reduce((acc, s) => acc + monthlyValueOfSubscription(s, now), 0);
  return { mrrAtRiskCents, atRiskCount: atRisk.length };
}

// ─── Inadimplência ────────────────────────────────────────────────────────────

export interface OverdueInvoice {
  status: InvoiceStatus;
  total: number; // centavos
}

export interface OverdueSummary {
  overdueCount: number;
  overdueTotalCents: number;
}

/** Conta e soma faturas OVERDUE — pura. */
export function computeOverdueSummary(invoices: OverdueInvoice[]): OverdueSummary {
  const overdue = invoices.filter((i) => i.status === "OVERDUE");
  return {
    overdueCount: overdue.length,
    overdueTotalCents: overdue.reduce((acc, i) => acc + i.total, 0),
  };
}

// ─── Distribuição de health score ─────────────────────────────────────────────

export interface CompanyCategory {
  healthCategory: HealthCategory | null;
}

export interface CategoryDistribution {
  CRITICAL: number;
  AT_RISK: number;
  HEALTHY: number;
  THRIVING: number;
  UNKNOWN: number; // sem categoria calculada ainda
}

/** Distribui empresas por categoria de saúde (null → UNKNOWN) — pura. */
export function bucketByCategory(companies: CompanyCategory[]): CategoryDistribution {
  const dist: CategoryDistribution = { CRITICAL: 0, AT_RISK: 0, HEALTHY: 0, THRIVING: 0, UNKNOWN: 0 };
  for (const c of companies) {
    const key = c.healthCategory ?? "UNKNOWN";
    dist[key] += 1;
  }
  return dist;
}

// ─── Snapshot composto (async, junta as queries) ──────────────────────────────

export interface ClientHealthSnapshot {
  totalCompanies: number;
  activeCompanies: number;
  mrrAtRisk: MrrAtRisk;
  overdue: OverdueSummary;
  categories: CategoryDistribution;
}

/**
 * Lê base de empresas + assinaturas em risco + faturas vencidas e monta o snapshot.
 */
export async function getClientHealthSnapshot(now: Date = new Date()): Promise<ClientHealthSnapshot> {
  const [companies, riskSubs, overdueInvoices, activeCompanies] = await Promise.all([
    prisma.company.findMany({ select: { healthCategory: true } }),
    prisma.subscription.findMany({
      where: { status: { in: AT_RISK_STATUS } },
      select: {
        status: true,
        billingCycle: true,
        discountPercent: true,
        discountExpiresAt: true,
        plan: { select: { priceMonthly: true, priceYearly: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { status: "OVERDUE" },
      select: { status: true, total: true },
    }),
    prisma.company.count({ where: { isBlocked: false } }),
  ]);

  const subsForRisk: SubscriptionAtRisk[] = riskSubs.map((s) => ({
    status: s.status,
    billingCycle: s.billingCycle,
    discountPercent: s.discountPercent,
    discountExpiresAt: s.discountExpiresAt,
    priceMonthly: s.plan.priceMonthly,
    priceYearly: s.plan.priceYearly,
  }));

  return {
    totalCompanies: companies.length,
    activeCompanies,
    mrrAtRisk: computeMrrAtRisk(subsForRisk, now),
    overdue: computeOverdueSummary(overdueInvoices),
    categories: bucketByCategory(companies),
  };
}
