import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { DollarSign, TrendingUp, AlertTriangle, Calendar, ArrowRight } from "lucide-react";

export default async function FinanceiroPage() {
  await requireAdmin();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  // Métricas financeiras
  const [
    recebidoMes,
    pendente,
    vencido,
    previsaoProximoMes,
    faturasVencidas,
  ] = await Promise.all([
    // Recebido no mês atual
    prisma.invoice.aggregate({
      where: {
        status: "PAID",
        paidAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { total: true },
    }),
    // Pendente (PENDING)
    prisma.invoice.aggregate({
      where: { status: "PENDING" },
      _sum: { total: true },
    }),
    // Vencido (OVERDUE)
    prisma.invoice.aggregate({
      where: { status: "OVERDUE" },
      _sum: { total: true },
    }),
    // Previsão próximo mês (faturas que vencem no próximo mês)
    prisma.invoice.aggregate({
      where: {
        status: { in: ["PENDING", "DRAFT"] },
        dueDate: { gte: startOfNextMonth, lte: endOfNextMonth },
      },
      _sum: { total: true },
    }),
    // Top 5 faturas vencidas
    prisma.invoice.findMany({
      where: { status: "OVERDUE" },
      include: {
        subscription: {
          include: {
            company: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
  ]);

  const recebidoValue = ((recebidoMes._sum?.total ?? 0) / 100);
  const pendenteValue = ((pendente._sum?.total ?? 0) / 100);
  const vencidoValue = ((vencido._sum?.total ?? 0) / 100);
  const previsaoValue = ((previsaoProximoMes._sum?.total ?? 0) / 100);

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-gray-400">Visão geral das finanças do SaaS</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Recebido (Mês)"
          value={`R$ ${recebidoValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          color="green"
        />
        <KpiCard
          title="Pendente"
          value={`R$ ${pendenteValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          color="yellow"
        />
        <KpiCard
          title="Vencido"
          value={`R$ ${vencidoValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={AlertTriangle}
          color={vencidoValue > 0 ? "red" : "gray"}
        />
        <KpiCard
          title="Previsão Próx. Mês"
          value={`R$ ${previsaoValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={Calendar}
          color="blue"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inadimplentes */}
        <div className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Faturas Vencidas ({faturasVencidas.length})
            </h2>
            <Link
              href="/admin/financeiro/inadimplencia"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-800/50">
            {faturasVencidas.length === 0 ? (
              <p className="px-5 py-8 text-center text-gray-600 text-sm">
                Nenhuma fatura vencida 🎉
              </p>
            ) : (
              faturasVencidas.map((inv) => {
                const diasAtraso = inv.dueDate
                  ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)
                  : 0;
                return (
                  <div key={inv.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/30">
                    <div>
                      <Link
                        href={`/admin/clientes/${inv.subscription.company.id}`}
                        className="font-medium text-white hover:text-indigo-300"
                      >
                        {inv.subscription.company.name}
                      </Link>
                      <p className="text-xs text-red-400">
                        {diasAtraso} {diasAtraso === 1 ? "dia" : "dias"} de atraso
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-white font-medium">
                        R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-500">
                        Venc: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Links Rápidos */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Ações Rápidas</h2>
          <div className="space-y-3">
            <QuickLink
              href="/admin/financeiro/faturas"
              title="Todas as Faturas"
              description="Visualizar e gerenciar todas as faturas"
            />
            <QuickLink
              href="/admin/financeiro/faturas/nova"
              title="Nova Cobrança"
              description="Criar cobrança manual para um cliente"
            />
            <QuickLink
              href="/admin/financeiro/inadimplencia"
              title="Inadimplência"
              description="Ver clientes com pagamentos atrasados"
            />
            <QuickLink
              href="/admin/clientes?status=PAST_DUE"
              title="Clientes em Atraso"
              description="Gerenciar clientes inadimplentes"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color }: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  const colors: Record<string, string> = {
    green: "text-green-400 bg-green-900/20",
    yellow: "text-yellow-400 bg-yellow-900/20",
    red: "text-red-400 bg-red-900/20",
    blue: "text-blue-400 bg-blue-900/20",
    gray: "text-gray-400 bg-gray-800",
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

function QuickLink({ href, title, description }: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-gray-500" />
      </div>
    </Link>
  );
}
