import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus, Ticket } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-900/50 text-blue-400",
  IN_PROGRESS: "bg-yellow-900/50 text-yellow-400",
  WAITING_CUSTOMER: "bg-purple-900/50 text-purple-400",
  WAITING_INTERNAL: "bg-orange-900/50 text-orange-400",
  RESOLVED: "bg-green-900/50 text-green-400",
  CLOSED: "bg-gray-800 text-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em Andamento",
  WAITING_CUSTOMER: "Aguard. Cliente",
  WAITING_INTERNAL: "Aguard. Dev",
  RESOLVED: "Resolvido",
  CLOSED: "Fechado",
};

const PRIORITY_ICONS: Record<string, string> = {
  LOW: "🟢",
  MEDIUM: "🟡",
  HIGH: "🟠",
  URGENT: "🔴",
};

export default async function TicketsPage() {
  await requireAdmin();

  const [tickets, counts] = await Promise.all([
    prisma.supportTicket.findMany({
      include: {
        company: { select: { tradeName: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.supportTicket.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  const statusCounts = counts.reduce((acc, curr) => {
    acc[curr.status] = curr._count.id;
    return acc;
  }, {} as Record<string, number>);

  const openCount = statusCounts["OPEN"] || 0;
  const inProgressCount = statusCounts["IN_PROGRESS"] || 0;
  const waitingCount = (statusCounts["WAITING_CUSTOMER"] || 0) + (statusCounts["WAITING_INTERNAL"] || 0);
  const resolvedCount = statusCounts["RESOLVED"] || 0;

  return (
    <div className="p-6 text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tickets de Suporte</h1>
          <p className="text-gray-400">{tickets.length} tickets encontrados</p>
        </div>
        <Link
          href="/admin/suporte/tickets/novo"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Ticket
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Abertos</p>
          <p className="text-2xl font-bold text-blue-400">{openCount}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Em Andamento</p>
          <p className="text-2xl font-bold text-yellow-400">{inProgressCount}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Aguardando</p>
          <p className="text-2xl font-bold text-purple-400">{waitingCount}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Resolvidos</p>
          <p className="text-2xl font-bold text-green-400">{resolvedCount}</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">#</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Assunto</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Cliente</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Prior.</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Criado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
              >
                <td className="px-5 py-4">
                  <Link
                    href={`/admin/suporte/tickets/${ticket.id}`}
                    className="text-indigo-400 hover:text-indigo-300 font-mono text-sm"
                  >
                    {ticket.number}
                  </Link>
                </td>
                <td className="px-5 py-4">
                  <Link
                    href={`/admin/suporte/tickets/${ticket.id}`}
                    className="text-white hover:text-indigo-300"
                  >
                    {ticket.subject}
                  </Link>
                  <p className="text-xs text-gray-500">{ticket.category}</p>
                </td>
                <td className="px-5 py-4 text-gray-300">{ticket.company.tradeName}</td>
                <td className="px-5 py-4">
                  <span>
                    {PRIORITY_ICONS[ticket.priority]} {ticket.priority}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[ticket.status] || "bg-gray-800 text-gray-400"}`}
                  >
                    {STATUS_LABELS[ticket.status] || ticket.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-gray-500 text-sm">
                  {new Date(ticket.createdAt).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tickets.length === 0 && (
          <div className="text-center py-12">
            <Ticket className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">Nenhum ticket encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
