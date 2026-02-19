import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { AlertTriangle, Building2, Calendar, DollarSign } from "lucide-react";

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
    <div className="p-6 text-white">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          Inadimplência
        </h1>
        <p className="text-sm text-gray-400">Faturas vencidas e pagamentos atrasados</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Vencido</p>
          <p className="text-2xl font-bold text-red-400">
            R$ {((totalVencido._sum?.total ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 mb-1">Total de Faturas</p>
          <p className="text-2xl font-bold text-white">{totalGeral}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 mb-1">+ de 15 dias</p>
          <p className="text-2xl font-bold text-orange-400">{total15}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500 mb-1">+ de 30 dias</p>
          <p className="text-2xl font-bold text-red-400">{total30}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        <p className="text-xs text-gray-500 w-full mb-1">FILTRAR POR DIAS DE ATRASO:</p>
        <Link
          href="/admin/financeiro/inadimplencia"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            !diasFilter ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          Todas ({totalGeral})
        </Link>
        <Link
          href="/admin/financeiro/inadimplencia?dias=7"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            diasFilter === "7" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          + de 7 dias ({total7})
        </Link>
        <Link
          href="/admin/financeiro/inadimplencia?dias=15"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            diasFilter === "15" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          + de 15 dias ({total15})
        </Link>
        <Link
          href="/admin/financeiro/inadimplencia?dias=30"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            diasFilter === "30" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          + de 30 dias ({total30})
        </Link>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Cliente</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Plano</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Valor</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Vencimento</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Dias Atraso</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Contato</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Ações</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <AlertTriangle className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-600">Nenhuma fatura vencida</p>
                </td>
              </tr>
            ) : (
              invoices.map((inv) => {
                const company = inv.subscription.company;
                const diasAtraso = inv.dueDate
                  ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)
                  : 0;

                let atrasoColor = "text-yellow-400";
                if (diasAtraso > 30) atrasoColor = "text-red-400";
                else if (diasAtraso > 15) atrasoColor = "text-orange-400";

                return (
                  <tr key={inv.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/clientes/${company.id}`}
                        className="font-medium text-white hover:text-indigo-300"
                      >
                        {company.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-gray-400">{inv.subscription.plan.name}</td>
                    <td className="px-5 py-4 text-white font-medium">
                      R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-4 text-gray-400">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`font-semibold ${atrasoColor}`}>
                        {diasAtraso} {diasAtraso === 1 ? "dia" : "dias"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-xs text-gray-400">
                        <p>{company.email || "—"}</p>
                        <p>{company.phone || "—"}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/financeiro/faturas/${inv.id}`}
                        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
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
