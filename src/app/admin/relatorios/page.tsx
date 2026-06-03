import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users, CreditCard, FileText, Ticket, Download, Heart, Activity } from "lucide-react";
import { computeMRR, computeChurnRate, type SubscriptionForMRR } from "@/lib/admin-metrics";

export default async function RelatoriosPage() {
  await requireAdmin();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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
    <div className="p-6 text-white">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-gray-400">Gere relatórios e exporte dados do sistema</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">MRR Estimado</p>
          <p className="text-2xl font-bold text-green-400">
            R$ {(mrrEstimado / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Clientes Ativos</p>
          <p className="text-2xl font-bold text-white">{activeSubscriptions}</p>
          <p className="text-xs text-gray-500">+ {trialSubscriptions} em trial</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Churn (Mês) <span className="text-gray-600">· est.</span></p>
          <p className="text-2xl font-bold text-red-400">{churnPct}%</p>
          <p className="text-xs text-gray-500">
            {canceledThisMonth} cancelada{canceledThisMonth === 1 ? "" : "s"} de {activeAtMonthStart} ativas
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Tickets (Mês)</p>
          <p className="text-2xl font-bold text-blue-400">{ticketsThisMonth}</p>
        </div>
      </div>

      {/* Aviso */}
      <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg px-4 py-3 mb-6">
        <p className="text-yellow-500 text-sm">
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
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <a
        href={href}
        className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
      >
        <Download className="w-4 h-4" />
        Baixar CSV
      </a>
    </div>
  );
}
