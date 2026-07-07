import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users, CreditCard, FileText, Ticket, Download, Heart, Activity } from "lucide-react";
import { computeMRR, computeChurnRate, type SubscriptionForMRR } from "@/lib/admin-metrics";
import { startOfLocalMonth } from "@/lib/date-utils";
import { ReconcileBillingButton } from "./ReconcileBillingButton";
import { PageHeader } from "@/components/admin/PageHeader";
import { KPICard } from "@/components/admin/KPICard";
import { DollarSign } from "lucide-react";

export default async function RelatoriosPage() {
  await requireAdmin();

  const now = new Date();
  // Início do mês no fuso local (BRT), não no fuso do servidor (UTC na Vercel).
  // Alimenta churn/tickets/base ativa: sem isso, eventos das últimas horas do
  // mês (BRT) caíam no mês seguinte, distorcendo numerador E denominador do churn.
  const startOfMonth = startOfLocalMonth(now);

  const [
    activeSubscriptions,
    trialSubscriptions,
    canceledThisMonth,
    ticketsThisMonth,
    activeAtMonthStart,
    mrrData,
  ] = await Promise.all([
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "TRIAL" } }),
    prisma.subscription.count({
      where: { status: "CANCELED", canceledAt: { gte: startOfMonth } },
    }),
    prisma.supportTicket.count({ where: { createdAt: { gte: startOfMonth } } }),
    // Base inicial do mês (ESTIMATIVA — status atual ≠ status passado): assinaturas
    // ativadas antes do início do mês e ainda não canceladas naquele momento.
    prisma.subscription.count({
      where: {
        activatedAt: { lt: startOfMonth },
        OR: [{ canceledAt: null }, { canceledAt: { gte: startOfMonth } }],
      },
    }),
    // MRR: precisa do plano (preços) + ciclo/desconto da subscription.
    prisma.subscription.findMany({
      where: { status: "ACTIVE" },
      include: { plan: { select: { priceMonthly: true, priceYearly: true } } },
    }),
  ]);

  // MRR com desconto vigente + ciclo normalizado (helper puro, em centavos).
  const subsForMrr: SubscriptionForMRR[] = mrrData.map((s) => ({
    priceMonthly: s.plan.priceMonthly,
    priceYearly: s.plan.priceYearly,
    billingCycle: s.billingCycle,
    discountPercent: s.discountPercent,
    discountExpiresAt: s.discountExpiresAt,
  }));
  const mrrEstimado = computeMRR(subsForMrr, now);

  const churnRate = computeChurnRate({
    canceledInPeriod: canceledThisMonth,
    activeAtPeriodStart: activeAtMonthStart,
  });
  const churnPct = (churnRate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  return (
    <div className="p-6">
      <PageHeader
        title="Relatórios"
        subtitle="Gere relatórios e exporte dados do sistema"
        actions={<ReconcileBillingButton />}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard
          icon={DollarSign}
          label="MRR"
          value={`R$ ${(mrrEstimado / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
        />
        <KPICard
          icon={Users}
          label="Clientes Ativos"
          value={String(activeSubscriptions)}
          hint={`+ ${trialSubscriptions} em trial`}
        />
        <KPICard
          icon={Activity}
          label="Churn (Mês) · est."
          value={`${churnPct}%`}
          hint={`${canceledThisMonth} cancelada${canceledThisMonth === 1 ? "" : "s"} de ${activeAtMonthStart} ativas`}
        />
        <KPICard
          icon={Ticket}
          label="Tickets (Mês)"
          value={String(ticketsThisMonth)}
        />
      </div>

      {/* Aviso */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
        <p className="text-amber-700 text-sm">
          ⚠️ MRR e Churn são estimados com base nas assinaturas. Para dados precisos de receita,
          integre com gateway de pagamento (sprint futuro).
        </p>
      </div>

      {/* Cards de Export */}
      <h2 className="text-lg font-semibold mb-4">Exportar Dados</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ExportCard
          title="Clientes"
          description="Lista completa de clientes cadastrados"
          icon={Users}
          href="/api/admin/export/clientes"
        />
        <ExportCard
          title="Assinaturas"
          description="Status e histórico de assinaturas"
          icon={CreditCard}
          href="/api/admin/export/assinaturas"
        />
        <ExportCard
          title="Faturas"
          description="Histórico de cobranças emitidas"
          icon={FileText}
          href="/api/admin/export/faturas"
        />
        <ExportCard
          title="Tickets"
          description="Histórico de suporte"
          icon={Ticket}
          href="/api/admin/export/tickets"
        />
        <ExportCard
          title="Health Scores"
          description="Saúde dos clientes"
          icon={Heart}
          href="/api/admin/export/health-scores"
        />
        <ExportCard
          title="Auditoria"
          description="Log de ações administrativas"
          icon={Activity}
          href="/api/admin/export/auditoria"
        />
      </div>
    </div>
  );
}

function ExportCard({
  title,
  description,
  icon: Icon,
  href,
}: {
  title: string;
  description: string;
  icon: any;
  href: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <a
        href={href}
        className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/70 transition-colors"
      >
        <Download className="w-4 h-4" />
        Baixar CSV
      </a>
    </div>
  );
}
