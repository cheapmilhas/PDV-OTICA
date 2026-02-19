import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { TicketActions } from "./ticket-actions";
import { TicketMessages } from "./ticket-messages";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const priorityColors = {
  LOW: "bg-gray-100 text-gray-800",
  MEDIUM: "bg-blue-100 text-blue-800",
  HIGH: "bg-orange-100 text-orange-800",
  URGENT: "bg-red-100 text-red-800",
};

const priorityLabels = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

const statusColors = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  WAITING_CUSTOMER: "bg-purple-100 text-purple-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

const statusLabels = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em Andamento",
  WAITING_CUSTOMER: "Aguardando Cliente",
  RESOLVED: "Resolvido",
  CLOSED: "Fechado",
};

async function getTicket(id: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      company: true,
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!ticket) {
    notFound();
  }

  return ticket;
}

async function TicketDetail({ id }: { id: string }) {
  const ticket = await getTicket(id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-2xl font-bold">#{ticket.number}</p>
                <Badge className={priorityColors[ticket.priority]}>
                  {priorityLabels[ticket.priority]}
                </Badge>
                <Badge className={statusColors[ticket.status]}>
                  {statusLabels[ticket.status]}
                </Badge>
              </div>
              <h2 className="text-xl font-semibold mb-1">{ticket.subject}</h2>
              <p className="text-sm text-gray-600">{ticket.company.tradeName}</p>
            </div>
            <TicketActions ticket={ticket} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Criado em</p>
              <p className="font-medium">
                {format(ticket.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            {ticket.assignedTo && (
              <div>
                <p className="text-gray-600">Atribuído a</p>
                <p className="font-medium">{ticket.assignedTo.name}</p>
              </div>
            )}
            {ticket.resolvedAt && (
              <div>
                <p className="text-gray-600">Resolvido em</p>
                <p className="font-medium">
                  {format(ticket.resolvedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            )}
          </div>

          {ticket.description && (
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-600 mb-1">Descrição</p>
              <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mensagens */}
      <TicketMessages ticketId={ticket.id} messages={ticket.messages} />
    </div>
  );
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <Link
          href="/admin/suporte/tickets"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para tickets
        </Link>
      </div>

      <Suspense fallback={<div>Carregando ticket...</div>}>
        <TicketDetail id={id} />
      </Suspense>
    </div>
  );
}
