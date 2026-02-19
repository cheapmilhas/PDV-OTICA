import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { AlertTriangle, Building2, Clock, CreditCard, TrendingUp, DollarSign, Activity, CheckCircle2, Bell } from "lucide-react";
import Link from "next/link";
import { HealthBadge } from "@/components/health-badge";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo", TRIAL: "Trial", PAST_DUE: "Inadimplente",
  SUSPENDED: "Suspenso", CANCELED: "Cancelado", TRIAL_EXPIRED: "Trial Expirado",
};
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-900/50 text-green-400 border border-green-800",
  TRIAL: "bg-blue-900/50 text-blue-400 border border-blue-800",
  PAST_DUE: "bg-red-900/50 text-red-400 border border-red-800",
  SUSPENDED: "bg-red-900/50 text-red-400 border border-red-800",
  CANCELED: "bg-gray-800 text-gray-400 border border-gray-700",
  TRIAL_EXPIRED: "bg-orange-900/50 text-orange-400 border border-orange-800",
};

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
  ]);

  const totalRevenueValue = ((totalRevenue._sum?.total) ?? 0) / 100;
  const mrrValue = activeSubs.reduce((acc, sub) => {
    const monthly = sub.billingCycle === "YEARLY" ? sub.plan.priceMonthly : sub.plan.priceMonthly;
    return acc + monthly;
  }, 0) / 100;

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Bem-vindo, {admin.name} · {admin.role}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard title="Total de Empresas" value={totalCompanies} icon={Building2} color="blue" />
        <KpiCard title="Assinaturas Ativas" value={activeCount} icon={CreditCard} color="green" />
        <KpiCard
          title="MRR"
          value={`R$ ${mrrValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          color="purple"
        />
        <KpiCard title="Em Trial" value={trialCount} icon={Clock} color="yellow" />
        <KpiCard
          title="Receita Total"
          value={`R$ ${totalRevenueValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          color="teal"
        />
      </div>

      {/* Health Score Resumo */}
      {(criticalHealthCount > 0 || atRiskHealthCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {criticalHealthCount > 0 && (
            <Link href="/admin/clientes?health=CRITICAL" className="flex items-center gap-3 p-4 rounded-xl border border-red-800 bg-red-900/20 hover:bg-red-900/30 transition-colors">
              <Activity className="h-5 w-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-300">{criticalHealthCount} cliente{criticalHealthCount > 1 ? "s" : ""} em estado crítico</p>
                <p className="text-xs text-red-500">Requer ação imediata →</p>
              </div>
            </Link>
          )}
          {atRiskHealthCount > 0 && (
            <Link href="/admin/clientes?health=AT_RISK" className="flex items-center gap-3 p-4 rounded-xl border border-yellow-800 bg-yellow-900/20 hover:bg-yellow-900/30 transition-colors">
              <Activity className="h-5 w-5 text-yellow-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-300">{atRiskHealthCount} cliente{atRiskHealthCount > 1 ? "s" : ""} em risco</p>
                <p className="text-xs text-yellow-600">Precisa atenção →</p>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Ações Pendentes */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-400" />
            Ações Pendentes
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {pastDueCount > 0 && (
            <Link href="/admin/financeiro/inadimplencia" className="flex items-center gap-3 p-4 rounded-xl border border-red-800 bg-red-900/20 hover:bg-red-900/30 transition-colors">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-300">{pastDueCount} fatura{pastDueCount > 1 ? "s" : ""} vencida{pastDueCount > 1 ? "s" : ""}</p>
                <p className="text-xs text-red-500">Cobrar agora →</p>
              </div>
            </Link>
          )}
          {expiringTrials.length > 0 && (
            <Link href="/admin/clientes?status=TRIAL" className="flex items-center gap-3 p-4 rounded-xl border border-yellow-800 bg-yellow-900/20 hover:bg-yellow-900/30 transition-colors">
              <Clock className="h-5 w-5 text-yellow-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-300">{expiringTrials.length} trial{expiringTrials.length > 1 ? "s" : ""} expirando</p>
                <p className="text-xs text-yellow-600">Próximos 3 dias →</p>
              </div>
            </Link>
          )}
          {pendingInvoices.length > 0 && (
            <Link href="/admin/financeiro/faturas?status=PENDING" className="flex items-center gap-3 p-4 rounded-xl border border-blue-800 bg-blue-900/20 hover:bg-blue-900/30 transition-colors">
              <CheckCircle2 className="h-5 w-5 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-300">{pendingInvoices.length} fatura{pendingInvoices.length > 1 ? "s" : ""} a vencer</p>
                <p className="text-xs text-blue-600">Próximos 7 dias →</p>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Empresas recentes */}
      <div className="rounded-xl border border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Empresas Recentes</h2>
          <Link href="/admin/clientes" className="text-xs text-indigo-400 hover:text-indigo-300">Ver todas →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Empresa", "Plano", "Status", "Usuários", "Cadastro"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentCompanies.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-600">Nenhuma empresa</td></tr>
              ) : recentCompanies.map((c) => {
                const sub = c.subscriptions[0];
                const status = sub?.status ?? "NO_SUBSCRIPTION";
                return (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-white hover:text-indigo-300">{c.name}</Link>
                    </td>
                    <td className="px-5 py-3 text-gray-400">{sub?.plan?.name ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES["CANCELED"]}`}>
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">{c._count.users}</td>
                    <td className="px-5 py-3 text-gray-500">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: React.ElementType; color: string }) {
  const colors: Record<string, string> = {
    blue: "text-blue-400 bg-blue-900/20",
    green: "text-green-400 bg-green-900/20",
    yellow: "text-yellow-400 bg-yellow-900/20",
    purple: "text-purple-400 bg-purple-900/20",
    teal: "text-teal-400 bg-teal-900/20",
  };
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500">{title}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={`text-2xl font-bold ${colors[color].split(" ")[0]}`}>{value}</p>
    </div>
  );
}
