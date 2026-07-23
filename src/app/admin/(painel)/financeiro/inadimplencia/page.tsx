import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { FilterBar, FilterChip } from "@/components/admin/FilterBar";
import { EmptyState } from "@/components/admin/EmptyState";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "../../dashboard-filters";

export default async function InadimplenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requireAdmin();

  // Lente de produto (Invoice → subscription.company).
  const product = await getProductContext();
  const pInv = buildDashboardFilters(product).invoiceCompany;

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
      AND: [pInv, { status: "OVERDUE", ...(dateCutoff ? { dueDate: { lte: dateCutoff } } : {}) }],
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
    // Cap de segurança: sem take, a lista crescia sem teto. Mais vencidos primeiro
    // (dueDate asc) já priorizam o que importa. Contadores por faixa (total7/15/30/geral)
    // continuam mostrando o número real mesmo além do cap.
    take: 500,
  });

  // Contadores — produto por AND em cada faixa (senão os chips contam os 2 produtos).
  const [total7, total15, total30, totalGeral] = await Promise.all([
    prisma.invoice.count({
      where: { AND: [pInv, { status: "OVERDUE", dueDate: { lte: new Date(Date.now() - 7 * 86400000) } }] },
    }),
    prisma.invoice.count({
      where: { AND: [pInv, { status: "OVERDUE", dueDate: { lte: new Date(Date.now() - 15 * 86400000) } }] },
    }),
    prisma.invoice.count({
      where: { AND: [pInv, { status: "OVERDUE", dueDate: { lte: new Date(Date.now() - 30 * 86400000) } }] },
    }),
    prisma.invoice.count({ where: { AND: [pInv, { status: "OVERDUE" }] } }),
  ]);

  // Total vencido
  const totalVencido = await prisma.invoice.aggregate({
    where: { AND: [pInv, { status: "OVERDUE" }] },
    _sum: { total: true },
  });

  return (
    <div className="p-6 text-foreground">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" aria-hidden="true" />
          Inadimplência
        </h1>
        <p className="text-sm text-muted-foreground">Faturas vencidas e pagamentos atrasados</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Vencido</p>
          <p className="text-2xl font-bold text-destructive">
            R$ {((totalVencido._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total de Faturas</p>
          <p className="text-2xl font-bold text-foreground">{totalGeral}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">+ de 15 dias</p>
          <p className="text-2xl font-bold text-warning">{total15}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">+ de 30 dias</p>
          <p className="text-2xl font-bold text-destructive">{total30}</p>
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
      {invoices.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={CheckCircle2}
            message="Nenhuma fatura vencida — tudo em dia por aqui."
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ResponsiveTable minWidth={880}>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Dias Atraso</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const company = inv.subscription.company;
                const diasAtraso = inv.dueDate
                  ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)
                  : 0;

                // Tom semântico via token (theme-aware): até 30 dias warning, acima destructive.
                let atrasoColor = "text-warning";
                if (diasAtraso > 30) atrasoColor = "text-destructive";

                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link
                        href={`/admin/clientes/${company.id}`}
                        className="font-medium text-foreground hover:text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {company.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{inv.subscription.plan.name}</TableCell>
                    <TableCell className="text-foreground font-medium">
                      R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`font-semibold ${atrasoColor}`}>
                        {diasAtraso} {diasAtraso === 1 ? "dia" : "dias"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        <p>{company.email || "—"}</p>
                        <p>{company.phone || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/financeiro/faturas/${inv.id}`}
                        className="inline-flex px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Cobrar
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ResponsiveTable>
        </div>
      )}
    </div>
  );
}
