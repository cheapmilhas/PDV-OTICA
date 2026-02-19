import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  FileText, ExternalLink, CheckCircle, Circle,
  Send, Receipt, CreditCard, AlertTriangle
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELED: "Cancelado",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-800 text-gray-400",
  PENDING: "bg-yellow-900/50 text-yellow-400",
  PAID: "bg-green-900/50 text-green-400",
  OVERDUE: "bg-red-900/50 text-red-400",
  CANCELED: "bg-gray-800 text-gray-500",
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
    <div className="p-6 text-white">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Faturas</h1>
          <p className="text-sm text-gray-400">Gestão de cobranças manuais</p>
        </div>
        <Link
          href="/admin/financeiro/faturas/nova"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
        >
          <FileText className="w-4 h-4" />
          Nova Cobrança
        </Link>
      </div>

      {/* Resumo Financeiro */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Recebido</p>
          <p className="text-xl font-bold text-green-400">
            R$ {((totalRecebido._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 mb-1">A Receber</p>
          <p className="text-xl font-bold text-yellow-400">
            R$ {((totalPendente._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 mb-1">Faturas Pagas</p>
          <p className="text-xl font-bold text-white">{totalPaid}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 mb-1">Vencidas</p>
          <p className="text-xl font-bold text-red-400">{totalOverdue}</p>
        </div>
      </div>

      {/* Filtros por Etapa (Workflow) */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-2">FILTRAR POR ETAPA DO WORKFLOW:</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/financeiro/faturas"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              !etapaFilter && !statusFilter ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Todas
          </Link>
          <Link
            href="/admin/financeiro/faturas?etapa=aguardando_envio"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
              etapaFilter === "aguardando_envio" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            <Send className="w-3 h-3" />
            Aguardando Envio ({aguardandoEnvio})
          </Link>
          <Link
            href="/admin/financeiro/faturas?etapa=aguardando_pagamento"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
              etapaFilter === "aguardando_pagamento" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            <CreditCard className="w-3 h-3" />
            Aguardando Pagamento ({aguardandoPagamento})
          </Link>
          <Link
            href="/admin/financeiro/faturas?etapa=aguardando_nf"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
              etapaFilter === "aguardando_nf" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            <Receipt className="w-3 h-3" />
            Aguardando NF ({aguardandoNf})
          </Link>
          <Link
            href="/admin/financeiro/faturas?status=OVERDUE"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
              statusFilter === "OVERDUE" ? "bg-red-600 text-white" : "bg-red-900/30 text-red-400 hover:bg-red-900/50"
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            Vencidas ({totalOverdue})
          </Link>
        </div>
      </div>

      {/* Filtros por Status */}
      <div className="flex flex-wrap gap-2 mb-6">
        <p className="text-xs text-gray-500 w-full mb-1">FILTRAR POR STATUS:</p>
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <Link
            key={status}
            href={`/admin/financeiro/faturas?status=${status}`}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              statusFilter === status ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Empresa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Vencimento</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Enviado</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Pago</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">NF</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">NF Env.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-600">
                    Nenhuma fatura encontrada
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/clientes/${inv.subscription.company.id}`}
                        className="font-medium text-white hover:text-indigo-300"
                      >
                        {inv.subscription.company.name}
                      </Link>
                      <p className="text-xs text-gray-500">{inv.subscription.plan.name}</p>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[inv.status]}`}>
                        {STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    {/* Checkboxes visuais */}
                    <td className="px-4 py-3 text-center">
                      {inv.invoiceSent ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-600 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {inv.paymentConfirmed ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-600 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {inv.nfGenerated ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-600 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {inv.nfSent ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-600 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/financeiro/faturas/${inv.id}`}
                        className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
                      >
                        Gerenciar
                      </Link>
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
