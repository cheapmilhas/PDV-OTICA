import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { AlertTriangle, Building2, Clock, CreditCard, TrendingUp, DollarSign, Activity, CheckCircle2, Bell } from "lucide-react";
import Link from "next/link";
import { HealthBadge } from "@/components/health-badge";
import { RecalcHealthButton } from "./RecalcHealthButton";
import { PageHeader } from "@/components/admin/PageHeader";
import { KPICard } from "@/components/admin/KPICard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AlertCard } from "@/components/admin/AlertCard";
import { startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";
import { computeTrend, formatTrend, computeMRR, computeMrrSeries, type SubscriptionForMRR, type SubscriptionForSeries } from "@/lib/admin-metrics";
import { MrrChart } from "@/components/admin/MrrChart";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  const [
    totalCompanies,
    activeCount,
    trialCount,
    pastDueCount,
    suspendedCount,
    totalRevenue,
    recentCompanies,
    expiringTrials,
    activeSubs,
    criticalHealthCount,
    atRiskHealthCount,
    pendingInvoices,
    lastHealthCalc,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "TRIAL" } }),
    prisma.subscription.count({ where: { status: "PAST_DUE" } }),
    prisma.subscription.count({ where: { status: "SUSPENDED" } }),
    prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { total: true } }),
    prisma.company.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        subscriptions: { take: 1, orderBy: { createdAt: "desc" }, include: { plan: true } },
        _count: { select: { users: true } },
      },
    }),
    prisma.subscription.findMany({
      where: {
        status: "TRIAL",
        trialEndsAt: { lte: new Date(Date.now() + 3 * 86400000), gte: new Date() },
      },
      include: { company: { select: { id: true, name: true } }, plan: { select: { name: true } } },
    }),
    prisma.subscription.findMany({ where: { status: "ACTIVE" }, include: { plan: true } }),
    prisma.company.count({ where: { healthCategory: "CRITICAL" } }),
    prisma.company.count({ where: { healthCategory: "AT_RISK" } }),
    prisma.invoice.findMany({
      where: {
        status: "PENDING",
        dueDate: { lte: new Date(Date.now() + 7 * 86400000) } // Vence em 7 dias
      },
      include: {
        subscription: {
          include: {
            company: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    // Fase A: data do health mais recente — mostra se os números de saúde estão frescos.
    prisma.company.findFirst({
      where: { healthUpdatedAt: { not: null } },
      orderBy: { healthUpdatedAt: "desc" },
      select: { healthUpdatedAt: true },
    }),
  ]);

  // Fase B: tendências mês atual vs. mês anterior (fuso SP — lição M2).
  const nowDate = new Date();
  const curStart = startOfLocalMonth(nowDate);
  const curEnd = endOfLocalMonth(nowDate);
  const prevRef = new Date(curStart.getTime() - 1); // 1ms antes do início do mês atual = mês anterior
  const prevStart = startOfLocalMonth(prevRef);
  const prevEnd = endOfLocalMonth(prevRef);

  const [
    newCompaniesCur,
    newCompaniesPrev,
    revenueCur,
    revenuePrev,
  ] = await Promise.all([
    prisma.company.count({ where: { createdAt: { gte: curStart, lte: curEnd } } }),
    prisma.company.count({ where: { createdAt: { gte: prevStart, lte: prevEnd } } }),
    prisma.invoice.aggregate({ where: { status: "PAID", paidAt: { gte: curStart, lte: curEnd } }, _sum: { total: true } }),
    prisma.invoice.aggregate({ where: { status: "PAID", paidAt: { gte: prevStart, lte: prevEnd } }, _sum: { total: true } }),
  ]);

  const companiesTrend = computeTrend(newCompaniesCur, newCompaniesPrev);
  const revenueTrend = computeTrend(
    (revenueCur._sum?.total ?? 0) / 100,
    (revenuePrev._sum?.total ?? 0) / 100
  );

  const totalRevenueValue = ((totalRevenue._sum?.total) ?? 0) / 100;
  // MRR com desconto vigente + ciclo normalizado (helper puro, centavos → reais).
  const subsForMrr: SubscriptionForMRR[] = activeSubs.map((sub) => ({
    priceMonthly: sub.plan.priceMonthly,
    priceYearly: sub.plan.priceYearly,
    billingCycle: sub.billingCycle,
    discountPercent: sub.discountPercent,
    discountExpiresAt: sub.discountExpiresAt,
  }));
  const mrrValue = computeMRR(subsForMrr, nowDate) / 100;
  const subsForSeries: SubscriptionForSeries[] = activeSubs.map((sub) => ({
    priceMonthly: sub.plan.priceMonthly,
    priceYearly: sub.plan.priceYearly,
    billingCycle: sub.billingCycle,
    discountPercent: sub.discountPercent,
    discountExpiresAt: sub.discountExpiresAt,
    createdAt: sub.createdAt,
  }));
  const mrrSeries = computeMrrSeries(subsForSeries, nowDate, 6);

  return (
    <div className="p-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Bem-vindo, ${admin.name} · ${admin.role}`}
        actions={
          <div className="flex flex-col items-end gap-1">
            <RecalcHealthButton />
            <p className="text-xs text-muted-foreground">
              {lastHealthCalc?.healthUpdatedAt
                ? `Saúde atualizada em ${new Date(lastHealthCalc.healthUpdatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`
                : "Saúde ainda não calculada — clique para recalcular"}
            </p>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <KPICard
          label="Total de Empresas"
          value={String(totalCompanies)}
          icon={Building2}
          trend={companiesTrend.direction === "up" || companiesTrend.direction === "down"
            ? { direction: companiesTrend.direction, label: `${formatTrend(companiesTrend)} · novas no mês` }
            : undefined}
        />
        <KPICard label="Assinaturas Ativas" value={String(activeCount)} icon={CreditCard} />
        <KPICard
          label="MRR"
          value={`R$ ${mrrValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
        />
        <KPICard label="Em Trial" value={String(trialCount)} icon={Clock} />
        <KPICard
          label="Recebido Total"
          value={`R$ ${totalRevenueValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          hint="Soma das faturas pagas"
          trend={revenueTrend.direction === "up" || revenueTrend.direction === "down"
            ? { direction: revenueTrend.direction, label: `${formatTrend(revenueTrend)} · recebido vs. mês anterior` }
            : undefined}
        />
      </div>

      {/* Evolução do MRR */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Evolução do MRR</h2>
            <p className="text-xs text-muted-foreground">Últimos 6 meses · aproximado pela data de início das assinaturas ativas</p>
          </div>
          <p className="text-lg font-semibold text-foreground">R$ {mrrValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="h-56">
          <MrrChart data={mrrSeries} />
        </div>
      </Card>

      {/* Health Score Resumo */}
      {(criticalHealthCount > 0 || atRiskHealthCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {criticalHealthCount > 0 && (
            <AlertCard
              tone="danger"
              icon={Activity}
              href="/admin/saude?category=CRITICAL"
              title={`${criticalHealthCount} cliente${criticalHealthCount > 1 ? "s" : ""} em estado crítico`}
              description="Requer ação imediata →"
            />
          )}
          {atRiskHealthCount > 0 && (
            <AlertCard
              tone="warning"
              icon={Activity}
              href="/admin/saude?category=AT_RISK"
              title={`${atRiskHealthCount} cliente${atRiskHealthCount > 1 ? "s" : ""} em risco`}
              description="Precisa atenção →"
            />
          )}
        </div>
      )}

      {/* Ações Pendentes */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            Ações Pendentes
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {pastDueCount === 0 && expiringTrials.length === 0 && pendingInvoices.length === 0 && (
            <AlertCard
              tone="success"
              icon={CheckCircle2}
              title="Nenhuma ação pendente no momento"
              className="md:col-span-3"
            />
          )}
          {pastDueCount > 0 && (
            <AlertCard
              tone="danger"
              icon={AlertTriangle}
              href="/admin/financeiro/inadimplencia"
              title={`${pastDueCount} fatura${pastDueCount > 1 ? "s" : ""} vencida${pastDueCount > 1 ? "s" : ""}`}
              description="Cobrar agora →"
            />
          )}
          {expiringTrials.length > 0 && (
            <AlertCard
              tone="warning"
              icon={Clock}
              href="/admin/clientes?status=TRIAL"
              title={`${expiringTrials.length} trial${expiringTrials.length > 1 ? "s" : ""} expirando`}
              description="Próximos 3 dias →"
            />
          )}
          {pendingInvoices.length > 0 && (
            <AlertCard
              tone="info"
              icon={CheckCircle2}
              href="/admin/financeiro/faturas?status=PENDING"
              title={`${pendingInvoices.length} fatura${pendingInvoices.length > 1 ? "s" : ""} a vencer`}
              description="Próximos 7 dias →"
            />
          )}
        </div>
      </div>

      {/* Empresas recentes */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Empresas Recentes</h2>
          <Link href="/admin/clientes" className="text-xs text-primary hover:text-primary/80">Ver todas →</Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Usuários</TableHead>
              <TableHead>Cadastro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentCompanies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhuma empresa
                </TableCell>
              </TableRow>
            ) : (
              recentCompanies.map((c) => {
                const sub = c.subscriptions[0];
                const status = sub?.status ?? "NO_SUBSCRIPTION";
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-foreground hover:text-primary">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{sub?.plan?.name ?? "—"}</TableCell>
                    <TableCell>
                      <AdminStatusBadge kind="subscription" status={status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c._count.users}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
