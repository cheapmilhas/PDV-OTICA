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
import { SyncInvoicesButton } from "@/components/admin/sync-invoices-button";
import { ResendChargeButton } from "@/components/admin/resend-charge-button";
import { NovaCobrancaButton } from "@/components/admin/nova-cobranca-button";

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

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(statusFilter ? { status: statusFilter as any } : {}),
      ...etapaWhere,
    },
    orderBy: { createdAt: "desc" },
    include: {
      subscription: {
        include: {
          company: { select: { id: true, name: true, email: true, phone: true } },
          plan: { select: { name: true } },
        },
      },
    },
    take: 100,
  });

  // Contadores
  const [totalPending, totalPaid, totalOverdue, aguardandoEnvio, aguardandoPagamento, aguardandoNf] = await Promise.all([
    prisma.invoice.count({ where: { status: "PENDING" } }),
    prisma.invoice.count({ where: { status: "PAID" } }),
    prisma.invoice.count({ where: { status: "OVERDUE" } }),
    prisma.invoice.count({ where: { invoiceGenerated: true, invoiceSent: false, status: "PENDING" } }),
    prisma.invoice.count({ where: { invoiceSent: true, paymentConfirmed: false, status: "PENDING" } }),
    prisma.invoice.count({ where: { paymentConfirmed: true, nfGenerated: false } }),
  ]);

  const companies = await prisma.company.findMany({
    where: { subscriptions: { some: { status: { not: "CANCELED" } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Totais financeiros
  const totalRecebido = await prisma.invoice.aggregate({
    where: { status: "PAID" },
    _sum: { total: true },
  });

  const totalPendente = await prisma.invoice.aggregate({
    where: { status: { in: ["PENDING", "OVERDUE"] } },
    _sum: { total: true },
  });

  return (
    <div className="p-6 text-foreground">
      <PageHeader
        title="Faturas"
        subtitle="Gestão de cobranças manuais"
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
          <p className="text-xl font-bold text-emerald-600">
            R$ {((totalRecebido._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">A Receber</p>
          <p className="text-xl font-bold text-amber-600">
            R$ {((totalPendente._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Faturas Pagas</p>
          <p className="text-xl font-bold text-foreground">{totalPaid}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Vencidas</p>
          <p className="text-xl font-bold text-red-600">{totalOverdue}</p>
        </div>
      </div>

      {/* Filtros por Etapa (Workflow) */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-2">FILTRAR POR ETAPA DO WORKFLOW:</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/financeiro/faturas"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              !etapaFilter && !statusFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Todas
          </Link>
          <Link
            href="/admin/financeiro/faturas?etapa=aguardando_envio"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
              etapaFilter === "aguardando_envio" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Send className="w-3 h-3" />
            Aguardando Envio ({aguardandoEnvio})
          </Link>
          <Link
            href="/admin/financeiro/faturas?etapa=aguardando_pagamento"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
              etapaFilter === "aguardando_pagamento" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCard className="w-3 h-3" />
            Aguardando Pagamento ({aguardandoPagamento})
          </Link>
          <Link
            href="/admin/financeiro/faturas?etapa=aguardando_nf"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
              etapaFilter === "aguardando_nf" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Receipt className="w-3 h-3" />
            Aguardando NF ({aguardandoNf})
          </Link>
          <Link
            href="/admin/financeiro/faturas?status=OVERDUE"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
              statusFilter === "OVERDUE" ? "bg-red-600 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Empresa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Vencimento</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Enviado</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Pago</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">NF</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">NF Env.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma fatura encontrada
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border hover:bg-muted transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/clientes/${inv.subscription.company.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {inv.subscription.company.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{inv.subscription.plan.name}</p>
                    </td>
                    <td className="px-4 py-3 text-foreground font-medium">
                      R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <AdminStatusBadge kind="invoice" status={inv.status} />
                    </td>
                    {/* Checkboxes visuais */}
                    <td className="px-4 py-3 text-center">
                      {inv.invoiceSent ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600 mx-auto" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {inv.paymentConfirmed ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600 mx-auto" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {inv.nfGenerated ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600 mx-auto" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {inv.nfSent ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600 mx-auto" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ResendChargeButton
                          invoiceId={inv.id}
                          invoiceSent={inv.invoiceSent}
                          invoiceSentAt={inv.invoiceSentAt ? inv.invoiceSentAt.toISOString() : null}
                          sentToday={mesmoDia(inv.invoiceSentAt, new Date())}
                        />
                        <Link
                          href={`/admin/financeiro/faturas/${inv.id}`}
                          className="px-3 py-1.5 text-sm bg-muted text-foreground rounded hover:bg-muted/70 transition-colors"
                        >
                          Gerenciar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
