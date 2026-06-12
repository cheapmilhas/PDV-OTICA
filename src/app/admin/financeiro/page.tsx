import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { DollarSign, TrendingUp, AlertTriangle, Calendar, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { KPICard } from "@/components/admin/KPICard";

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
    <div className="p-6 text-foreground">
      <PageHeader title="Financeiro" subtitle="Visão geral das finanças do SaaS" />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          label="Recebido (Mês)"
          value={`R$ ${recebidoValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
        />
        <KPICard
          label="Pendente"
          value={`R$ ${pendenteValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
        />
        <KPICard
          label="Vencido"
          value={`R$ ${vencidoValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={AlertTriangle}
        />
        <KPICard
          label="Previsão Próx. Mês"
          value={`R$ ${previsaoValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={Calendar}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inadimplentes */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Faturas Vencidas ({faturasVencidas.length})
            </h2>
            <Link
              href="/admin/financeiro/inadimplencia"
              className="text-xs text-primary hover:text-primary flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {faturasVencidas.length === 0 ? (
              <p className="px-5 py-8 text-center text-muted-foreground text-sm">
                Nenhuma fatura vencida 🎉
              </p>
            ) : (
              faturasVencidas.map((inv) => {
                const diasAtraso = inv.dueDate
                  ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)
                  : 0;
                return (
                  <div key={inv.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted">
                    <div>
                      <Link
                        href={`/admin/clientes/${inv.subscription.company.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {inv.subscription.company.name}
                      </Link>
                      <p className="text-xs text-red-600">
                        {diasAtraso} {diasAtraso === 1 ? "dia" : "dias"} de atraso
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-foreground font-medium">
                        R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Ações Rápidas</h2>
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

function QuickLink({ href, title, description }: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block p-3 rounded-lg bg-muted hover:bg-muted/70 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
