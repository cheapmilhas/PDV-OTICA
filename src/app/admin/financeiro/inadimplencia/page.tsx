import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { FilterBar, FilterChip } from "@/components/admin/FilterBar";

export default async function InadimplenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const diasFilter = params.dias;

  // Calcular data de corte baseada no filtro
  let dateCutoff: Date | undefined;
  if (diasFilter === "7") {
    dateCutoff = new Date(Date.now() - 7 * 86400000);
  } else if (diasFilter === "15") {
    dateCutoff = new Date(Date.now() - 15 * 86400000);
  } else if (diasFilter === "30") {
    dateCutoff = new Date(Date.now() - 30 * 86400000);
  }

  // Buscar faturas vencidas
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "OVERDUE",
      ...(dateCutoff ? { dueDate: { lte: dateCutoff } } : {}),
    },
    include: {
      subscription: {
        include: {
          company: { select: { id: true, name: true, email: true, phone: true } },
          plan: { select: { name: true } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  // Contadores
  const [total7, total15, total30, totalGeral] = await Promise.all([
    prisma.invoice.count({
      where: {
        status: "OVERDUE",
        dueDate: { lte: new Date(Date.now() - 7 * 86400000) },
      },
    }),
    prisma.invoice.count({
      where: {
        status: "OVERDUE",
        dueDate: { lte: new Date(Date.now() - 15 * 86400000) },
      },
    }),
    prisma.invoice.count({
      where: {
        status: "OVERDUE",
        dueDate: { lte: new Date(Date.now() - 30 * 86400000) },
      },
    }),
    prisma.invoice.count({ where: { status: "OVERDUE" } }),
  ]);

  // Total vencido
  const totalVencido = await prisma.invoice.aggregate({
    where: { status: "OVERDUE" },
    _sum: { total: true },
  });

  return (
    <div className="p-6 text-foreground">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-red-600" />
          Inadimplência
        </h1>
        <p className="text-sm text-muted-foreground">Faturas vencidas e pagamentos atrasados</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Vencido</p>
          <p className="text-2xl font-bold text-red-600">
            R$ {((totalVencido._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total de Faturas</p>
          <p className="text-2xl font-bold text-foreground">{totalGeral}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">+ de 15 dias</p>
          <p className="text-2xl font-bold text-orange-600">{total15}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">+ de 30 dias</p>
          <p className="text-2xl font-bold text-red-600">{total30}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-2">FILTRAR POR DIAS DE ATRASO:</p>
        <FilterBar>
          <FilterChip href="/admin/financeiro/inadimplencia" active={!diasFilter}>
            Todas ({totalGeral})
          </FilterChip>
          <FilterChip href="/admin/financeiro/inadimplencia?dias=7" active={diasFilter === "7"}>
            + de 7 dias ({total7})
          </FilterChip>
          <FilterChip href="/admin/financeiro/inadimplencia?dias=15" active={diasFilter === "15"}>
            + de 15 dias ({total15})
          </FilterChip>
          <FilterChip href="/admin/financeiro/inadimplencia?dias=30" active={diasFilter === "30"}>
            + de 30 dias ({total30})
          </FilterChip>
        </FilterBar>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Cliente</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Plano</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Valor</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Vencimento</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Dias Atraso</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Contato</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <AlertTriangle className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-muted-foreground">Nenhuma fatura vencida</p>
                </td>
              </tr>
            ) : (
              invoices.map((inv) => {
                const company = inv.subscription.company;
                const diasAtraso = inv.dueDate
                  ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)
                  : 0;

                let atrasoColor = "text-amber-600";
                if (diasAtraso > 30) atrasoColor = "text-red-600";
                else if (diasAtraso > 15) atrasoColor = "text-orange-600";

                return (
                  <tr key={inv.id} className="border-b border-border hover:bg-muted transition-colors">
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/clientes/${company.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {company.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{inv.subscription.plan.name}</td>
                    <td className="px-5 py-4 text-foreground font-medium">
                      R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`font-semibold ${atrasoColor}`}>
                        {diasAtraso} {diasAtraso === 1 ? "dia" : "dias"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-xs text-muted-foreground">
                        <p>{company.email || "—"}</p>
                        <p>{company.phone || "—"}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/financeiro/faturas/${inv.id}`}
                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                      >
                        Cobrar
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
