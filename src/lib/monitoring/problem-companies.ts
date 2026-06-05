// src/lib/monitoring/problem-companies.ts
//
// Busca empresas em algum estado problemático e achata Company×Subscription×Invoice
// em ProblemCompany. Best-effort: o caller trata exceção. Cross-tenant (super-admin).
import { prisma } from "@/lib/prisma";
import type { ProblemCompany } from "./issues";
import type { SubscriptionStatus } from "@prisma/client";

const ACTIONABLE_SUB_STATUS: SubscriptionStatus[] = ["TRIAL", "TRIAL_EXPIRED", "PAST_DUE", "SUSPENDED"];
const TAKE_CAP = 200;

export async function getProblemCompanies(): Promise<ProblemCompany[]> {
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { isBlocked: true },
        { healthCategory: "CRITICAL" },
        { subscriptions: { some: { status: { in: ACTIONABLE_SUB_STATUS } } } },
        { subscriptions: { some: { pastDueSince: { not: null } } } },
        { subscriptions: { some: { billingSyncPending: true } } },
        { subscriptions: { some: { invoices: { some: { status: "OVERDUE" } } } } },
      ],
    },
    take: TAKE_CAP,
    select: {
      id: true, name: true, isBlocked: true, healthCategory: true,
      // TODAS as subscriptions: overdue agregado por EMPRESA (qualquer sub) +
      // escolher a "acionável" p/ o status. orderBy p/ fallback determinístico.
      subscriptions: {
        orderBy: { createdAt: "desc" },
        select: {
          status: true, trialEndsAt: true, pastDueSince: true, billingSyncPending: true,
          invoices: { where: { status: "OVERDUE" }, select: { total: true } },
        },
      },
    },
  });

  return companies.map((c): ProblemCompany => {
    const subs = c.subscriptions;
    // status: primeira sub acionável (subs já vem mais-recente-primeiro); fallback: mais recente; senão null.
    const actionableSub = subs.find((s) => ACTIONABLE_SUB_STATUS.includes(s.status)) ?? subs[0] ?? null;
    const anyPendingSync = subs.some((s) => s.billingSyncPending);
    const allOverdue = subs.flatMap((s) => s.invoices);
    return {
      id: c.id,
      name: c.name,
      isBlocked: c.isBlocked,
      healthCategory: c.healthCategory,
      subscriptionStatus: actionableSub?.status ?? null,
      trialEndsAt: actionableSub?.trialEndsAt ?? null,
      pastDueSince: actionableSub?.pastDueSince ?? null,
      billingSyncPending: anyPendingSync,
      overdueInvoiceCount: allOverdue.length,
      overdueTotalCents: allOverdue.reduce((s, i) => s + i.total, 0),
    };
  });
}
