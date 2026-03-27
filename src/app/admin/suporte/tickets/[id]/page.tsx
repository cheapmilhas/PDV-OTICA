import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { TicketActions } from "./ticket-actions";
import { TicketMessages } from "./ticket-messages";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const priorityColors: Record<string, string> = {
  LOW:    "bg-gray-800 text-gray-400 border border-gray-700",
  MEDIUM: "bg-blue-900/30 text-blue-400 border border-blue-800",
  HIGH:   "bg-orange-900/30 text-orange-400 border border-orange-800",
  URGENT: "bg-red-900/30 text-red-400 border border-red-800",
};

const priorityLabels: Record<string, string> = {
  LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente",
};

const statusColors: Record<string, string> = {
  OPEN:             "bg-blue-900/30 text-blue-400 border border-blue-800",
  IN_PROGRESS:      "bg-yellow-900/30 text-yellow-400 border border-yellow-800",
  WAITING_CUSTOMER: "bg-purple-900/30 text-purple-400 border border-purple-800",
  WAITING_INTERNAL: "bg-orange-900/30 text-orange-400 border border-orange-800",
  RESOLVED:         "bg-green-900/30 text-green-400 border border-green-800",
  CLOSED:           "bg-gray-800 text-gray-400 border border-gray-700",
};

const statusLabels: Record<string, string> = {
  OPEN:             "Aberto",
  IN_PROGRESS:      "Em Andamento",
  WAITING_CUSTOMER: "Aguardando Cliente",
  WAITING_INTERNAL: "Aguardando Dev",
  RESOLVED:         "Resolvido",
  CLOSED:           "Fechado",
};

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      company: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) notFound();

  return (
    <div className="p-6 text-white max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/suporte/tickets"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para tickets
        </Link>
      </div>

      {/* Ticket Info */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-2xl font-bold text-white">#{ticket.number}</p>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${priorityColors[ticket.priority] ?? priorityColors.MEDIUM}`}>
                {priorityLabels[ticket.priority] ?? ticket.priority}
              </span>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[ticket.status] ?? statusColors.OPEN}`}>
                {statusLabels[ticket.status] ?? ticket.status}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">{ticket.subject}</h2>
            <Link
              href={`/admin/clientes/${ticket.company.id}`}
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              {ticket.company.tradeName || ticket.company.name}
            </Link>
          </div>
          <TicketActions ticket={ticket} />
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm pt-4 border-t border-gray-800">
          <div>
            <p className="text-gray-500 mb-0.5">Criado em</p>
            <p className="text-white font-medium">
              {format(ticket.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          {ticket.assignedTo && (
            <div>
              <p className="text-gray-500 mb-0.5">Atribuído a</p>
              <p className="text-white font-medium">{ticket.assignedTo.name}</p>
            </div>
          )}
          {ticket.resolvedAt && (
            <div>
              <p className="text-gray-500 mb-0.5">Resolvido em</p>
              <p className="text-green-400 font-medium">
                {format(ticket.resolvedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          )}
        </div>

        {ticket.description && (
          <div className="pt-4 mt-4 border-t border-gray-800">
            <p className="text-sm text-gray-500 mb-1">Descrição</p>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}
      </div>

      {/* Mensagens */}
      <TicketMessages ticketId={ticket.id} messages={ticket.messages} />
    </div>
  );
}
