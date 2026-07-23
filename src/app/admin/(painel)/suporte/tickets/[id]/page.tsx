import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { TicketActions } from "./ticket-actions";
import { TicketMessages } from "./ticket-messages";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getProductContext } from "@/lib/admin-product-context";

const priorityColors: Record<string, string> = {
  LOW:    "bg-muted text-muted-foreground border border-border",
  MEDIUM: "bg-blue-50 text-blue-600 border border-blue-200",
  HIGH:   "bg-orange-50 text-orange-600 border border-orange-200",
  URGENT: "bg-red-50 text-red-600 border border-red-200",
};

const priorityLabels: Record<string, string> = {
  LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente",
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

  // Consistência com o toggle (SupportTicket.company é obrigatório no schema).
  const product = await getProductContext();
  if (ticket.company.platformProduct !== product) notFound();

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/suporte/tickets"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para tickets
        </Link>
      </div>

      {/* Ticket Info */}
      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-2xl font-bold text-foreground">#{ticket.number}</p>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${priorityColors[ticket.priority] ?? priorityColors.MEDIUM}`}>
                {priorityLabels[ticket.priority] ?? ticket.priority}
              </span>
              <AdminStatusBadge kind="ticket" status={ticket.status} />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">{ticket.subject}</h2>
            <Link
              href={`/admin/clientes/${ticket.company.id}`}
              className="text-sm text-primary hover:text-primary"
            >
              {ticket.company.tradeName || ticket.company.name}
            </Link>
          </div>
          <TicketActions ticket={ticket} />
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm pt-4 border-t border-border">
          <div>
            <p className="text-muted-foreground mb-0.5">Criado em</p>
            <p className="text-foreground font-medium">
              {format(ticket.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          {ticket.assignedTo && (
            <div>
              <p className="text-muted-foreground mb-0.5">Atribuído a</p>
              <p className="text-foreground font-medium">{ticket.assignedTo.name}</p>
            </div>
          )}
          {ticket.resolvedAt && (
            <div>
              <p className="text-muted-foreground mb-0.5">Resolvido em</p>
              <p className="text-emerald-600 font-medium">
                {format(ticket.resolvedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          )}
        </div>

        {ticket.description && (
          <div className="pt-4 mt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-1">Descrição</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}
      </div>

      {/* Mensagens */}
      <TicketMessages ticketId={ticket.id} messages={ticket.messages} />
    </div>
  );
}
