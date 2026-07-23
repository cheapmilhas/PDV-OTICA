import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  CheckCircle, Circle,
  Send, Receipt, CreditCard, AlertTriangle
} from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { FilterBar, FilterChip } from "@/components/admin/FilterBar";
import { EmptyState } from "@/components/admin/EmptyState";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SyncInvoicesButton } from "@/components/admin/sync-invoices-button";
import { ResendChargeButton } from "@/components/admin/resend-charge-button";
import { NovaCobrancaButton } from "@/components/admin/nova-cobranca-button";
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "../../dashboard-filters";

function mesmoDia(a: Date | string | null | undefined, b: Date): boolean {
  if (!a) return false;
  const da = new Date(a);
  if (Number.isNaN(da.getTime())) return false;
  const key = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  return key(da) === key(b);
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELED: "Cancelado",
};

export default async function FaturasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; etapa?: string }>;
}) {
  await requireAdmin();

  // Lente de produto. Invoice → subscription.company; a lista de empresas do
  // picker (Company) → filtro direto por platformProduct.
  const product = await getProductContext();
  const pf = buildDashboardFilters(product);
  const pInv = pf.invoiceCompany;

  const params = await searchParams;
  const statusFilter = params.status;
  const etapaFilter = params.etapa;

  // Filtros por etapa
  let etapaWhere = {};
  if (etapaFilter === "aguardando_envio") {
    etapaWhere = { invoiceGenerated: true, invoiceSent: false, status: "PENDING" };
  } else if (etapaFilter === "aguardando_pagamento") {
    etapaWhere = { invoiceSent: true, paymentConfirmed: false, status: "PENDING" };
  } else if (etapaFilter === "aguardando_nf") {
    etapaWhere = { paymentConfirmed: true, nfGenerated: false };
  } else if (etapaFilter === "aguardando_envio_nf") {
    etapaWhere = { nfGenerated: true, nfSent: false };
  }

  // Produto compõe por AND (não spread): pInv aninha em subscription.company e
  // não pode colidir com os campos escalares de status/etapa.
  const listWhere = {
    AND: [
      pInv,
      {
        ...(statusFilter ? { status: statusFilter as any } : {}),
        ...etapaWhere,
      },
    ],
  };
  const [invoices, filteredTotal] = await Promise.all([
    prisma.invoice.findMany({
      where: listWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        subscription: {
          include: {
            company: { select: { id: true, name: true, email: true, phone: true } },
            plan: { select: { name: true } },
          },
        },
      },
      take: 100,
    }),
    // Total real respeitando o filtro atual — para não truncar em silêncio.
    prisma.invoice.count({ where: listWhere }),
  ]);

  // Contadores — cada um leva o produto por AND, senão os chips de workflow
  // contariam os dois produtos enquanto a lista mostra um só.
  const [totalPending, totalPaid, totalOverdue, aguardandoEnvio, aguardandoPagamento, aguardandoNf] = await Promise.all([
    prisma.invoice.count({ where: { AND: [pInv, { status: "PENDING" }] } }),
    prisma.invoice.count({ where: { AND: [pInv, { status: "PAID" }] } }),
    prisma.invoice.count({ where: { AND: [pInv, { status: "OVERDUE" }] } }),
    prisma.invoice.count({ where: { AND: [pInv, { invoiceGenerated: true, invoiceSent: false, status: "PENDING" }] } }),
    prisma.invoice.count({ where: { AND: [pInv, { invoiceSent: true, paymentConfirmed: false, status: "PENDING" }] } }),
    prisma.invoice.count({ where: { AND: [pInv, { paymentConfirmed: true, nfGenerated: false }] } }),
  ]);

  // Picker de empresa (Company) — filtro direto por produto (soft-delete incluso
  // via pf.company) para o operador não cobrar de uma empresa do outro produto.
  const companies = await prisma.company.findMany({
    where: {
      AND: [pf.company, { subscriptions: { some: { status: { not: "CANCELED" } } } }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Totais financeiros
  const totalRecebido = await prisma.invoice.aggregate({
    where: { AND: [pInv, { status: "PAID" }] },
    _sum: { total: true },
  });

  const totalPendente = await prisma.invoice.aggregate({
    where: { AND: [pInv, { status: { in: ["PENDING", "OVERDUE"] } }] },
    _sum: { total: true },
  });

  return (
    <div className="p-6 text-foreground">
      <PageHeader
        title="Faturas"
        subtitle={
          filteredTotal > invoices.length
            ? `Mostrando ${invoices.length} de ${filteredTotal} faturas — refine os filtros para ver as demais`
            : "Gestão de cobranças manuais"
        }
        actions={
          <div className="flex items-center gap-3">
            <SyncInvoicesButton />
            <NovaCobrancaButton companies={companies} />
          </div>
        }
      />

      {/* Resumo Financeiro */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Recebido</p>
          <p className="text-xl font-bold text-success">
            R$ {((totalRecebido._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">A Receber</p>
          <p className="text-xl font-bold text-warning">
            R$ {((totalPendente._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Faturas Pagas</p>
          <p className="text-xl font-bold text-foreground">{totalPaid}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Vencidas</p>
          <p className="text-xl font-bold text-destructive">{totalOverdue}</p>
        </div>
      </div>

      {/* Filtros por Etapa (Workflow) */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-2">FILTRAR POR ETAPA DO WORKFLOW:</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/financeiro/faturas"
            aria-current={!etapaFilter && !statusFilter ? "true" : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              !etapaFilter && !statusFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Todas
          </Link>
          <Link
            href="/admin/financeiro/faturas?etapa=aguardando_envio"
            aria-current={etapaFilter === "aguardando_envio" ? "true" : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              etapaFilter === "aguardando_envio" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Send className="w-3 h-3" />
            Aguardando Envio ({aguardandoEnvio})
          </Link>
          <Link
            href="/admin/financeiro/faturas?etapa=aguardando_pagamento"
            aria-current={etapaFilter === "aguardando_pagamento" ? "true" : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              etapaFilter === "aguardando_pagamento" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCard className="w-3 h-3" />
            Aguardando Pagamento ({aguardandoPagamento})
          </Link>
          <Link
            href="/admin/financeiro/faturas?etapa=aguardando_nf"
            aria-current={etapaFilter === "aguardando_nf" ? "true" : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              etapaFilter === "aguardando_nf" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Receipt className="w-3 h-3" />
            Aguardando NF ({aguardandoNf})
          </Link>
          <Link
            href="/admin/financeiro/faturas?status=OVERDUE"
            aria-current={statusFilter === "OVERDUE" ? "true" : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              statusFilter === "OVERDUE" ? "bg-destructive text-destructive-foreground" : "bg-destructive/10 text-destructive hover:bg-destructive/20"
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            Vencidas ({totalOverdue})
          </Link>
        </div>
      </div>

      {/* Filtros por Status */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-2">FILTRAR POR STATUS:</p>
        <FilterBar>
          {Object.entries(STATUS_LABELS).map(([status, label]) => (
            <FilterChip
              key={status}
              href={`/admin/financeiro/faturas?status=${status}`}
              active={statusFilter === status}
            >
              {label}
            </FilterChip>
          ))}
        </FilterBar>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {invoices.length === 0 ? (
          <EmptyState icon={Receipt} message="Nenhuma fatura encontrada" />
        ) : (
          <ResponsiveTable minWidth={980}>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Enviado</TableHead>
                <TableHead className="text-center">Pago</TableHead>
                <TableHead className="text-center">NF</TableHead>
                <TableHead className="text-center">NF Env.</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Link
                      href={`/admin/clientes/${inv.subscription.company.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {inv.subscription.company.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{inv.subscription.plan.name}</p>
                  </TableCell>
                  <TableCell className="text-foreground font-medium">
                    R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>
                    <AdminStatusBadge kind="invoice" status={inv.status} />
                  </TableCell>
                  {/* Checkboxes visuais */}
                  <TableCell className="text-center">
                    {inv.invoiceSent ? (
                      <CheckCircle aria-label="Enviado" className="w-5 h-5 text-success mx-auto" />
                    ) : (
                      <Circle aria-label="Não enviado" className="w-5 h-5 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {inv.paymentConfirmed ? (
                      <CheckCircle aria-label="Pago" className="w-5 h-5 text-success mx-auto" />
                    ) : (
                      <Circle aria-label="Não pago" className="w-5 h-5 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {inv.nfGenerated ? (
                      <CheckCircle aria-label="NF gerada" className="w-5 h-5 text-success mx-auto" />
                    ) : (
                      <Circle aria-label="NF não gerada" className="w-5 h-5 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {inv.nfSent ? (
                      <CheckCircle aria-label="NF enviada" className="w-5 h-5 text-success mx-auto" />
                    ) : (
                      <Circle aria-label="NF não enviada" className="w-5 h-5 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ResendChargeButton
                        invoiceId={inv.id}
                        invoiceSent={inv.invoiceSent}
                        invoiceSentAt={inv.invoiceSentAt ? inv.invoiceSentAt.toISOString() : null}
                        sentToday={mesmoDia(inv.invoiceSentAt, new Date())}
                      />
                      <Link
                        href={`/admin/financeiro/faturas/${inv.id}`}
                        className="px-3 py-1.5 text-sm bg-muted text-foreground rounded hover:bg-muted/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Gerenciar
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        )}
      </div>
    </div>
  );
}
