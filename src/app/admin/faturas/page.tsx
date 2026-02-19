import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho", PENDING: "Pendente", PAID: "Pago",
  OVERDUE: "Vencido", CANCELED: "Cancelado", REFUNDED: "Reembolsado",
};
const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-800 text-gray-400",
  PENDING: "bg-yellow-900/50 text-yellow-400",
  PAID: "bg-green-900/50 text-green-400",
  OVERDUE: "bg-red-900/50 text-red-400",
  CANCELED: "bg-gray-800 text-gray-500",
  REFUNDED: "bg-purple-900/50 text-purple-400",
};

export default async function FaturasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const statusFilter = params.status;

  const [invoices, statusCounts, totalPaid, totalPending] = await Promise.all([
    prisma.invoice.findMany({
      where: statusFilter ? { status: statusFilter as any } : {},
      orderBy: { issuedAt: "desc" },
      include: {
        subscription: {
          include: {
            company: { select: { id: true, name: true } },
            plan: { select: { name: true } },
          },
        },
      },
      take: 100,
    }),
    prisma.invoice.groupBy({ by: ["status"], _count: true }),
    prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { total: true } }),
    prisma.invoice.aggregate({ where: { status: "PENDING" }, _sum: { total: true } }),
  ]);

  const counts = statusCounts.reduce((acc, item) => ({ ...acc, [item.status]: item._count }), {} as Record<string, number>);

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Faturas</h1>
        <p className="text-sm text-gray-400 mt-0.5">Histórico de cobranças</p>
      </div>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Recebido", value: `R$ ${((totalPaid._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "text-green-400" },
          { label: "Pendente", value: `R$ ${((totalPending._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "text-yellow-400" },
          { label: "Faturas Pagas", value: counts.PAID ?? 0, color: "text-green-400" },
          { label: "Vencidas", value: counts.OVERDUE ?? 0, color: "text-red-400" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Link
          href="/admin/faturas"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!statusFilter ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
        >
          Todas
        </Link>
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <Link
            key={status}
            href={`/admin/faturas?status=${status}`}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${statusFilter === status ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
          >
            {label} ({counts[status] ?? 0})
          </Link>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Número", "Empresa", "Plano", "Valor", "Status", "Vencimento", "Pago em", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <FileText className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-600">Nenhuma fatura encontrada</p>
                  </td>
                </tr>
              ) : invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-300">{inv.number}</td>
                  <td className="px-5 py-3">
                    <Link href={`/admin/empresas/${inv.subscription.company.id}`} className="font-medium text-white hover:text-indigo-300">
                      {inv.subscription.company.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-400">{inv.subscription.plan.name}</td>
                  <td className="px-5 py-3 font-medium text-white">
                    R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status] ?? STATUS_STYLES["CANCELED"]}`}>
                      {STATUS_LABELS[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {inv.paymentUrl && (
                      <a href={inv.paymentUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-gray-500 hover:text-white rounded transition-colors inline-flex">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
