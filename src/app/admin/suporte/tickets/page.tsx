import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus, Ticket, Inbox, Loader, Clock, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { KPICard } from "@/components/admin/KPICard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";

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
    <div className="p-6">
      <PageHeader
        title="Tickets de Suporte"
        subtitle={`${tickets.length} tickets encontrados`}
        actions={
          <Link
            href="/admin/suporte/tickets/novo"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Ticket
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KPICard icon={Inbox} label="Abertos" value={String(openCount)} />
        <KPICard icon={Loader} label="Em Andamento" value={String(inProgressCount)} />
        <KPICard icon={Clock} label="Aguardando" value={String(waitingCount)} />
        <KPICard icon={CheckCircle} label="Resolvidos" value={String(resolvedCount)} />
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">#</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Assunto</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Cliente</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Prior.</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Criado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className="border-b border-border hover:bg-muted transition-colors"
              >
                <td className="px-5 py-4">
                  <Link
                    href={`/admin/suporte/tickets/${ticket.id}`}
                    className="text-primary hover:text-primary font-mono text-sm"
                  >
                    {ticket.number}
                  </Link>
                </td>
                <td className="px-5 py-4">
                  <Link
                    href={`/admin/suporte/tickets/${ticket.id}`}
                    className="text-foreground hover:text-primary"
                  >
                    {ticket.subject}
                  </Link>
                  <p className="text-xs text-muted-foreground">{ticket.category}</p>
                </td>
                <td className="px-5 py-4 text-foreground">{ticket.company.tradeName}</td>
                <td className="px-5 py-4">
                  <span>
                    {PRIORITY_ICONS[ticket.priority]} {ticket.priority}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <AdminStatusBadge kind="ticket" status={ticket.status} />
                </td>
                <td className="px-5 py-4 text-muted-foreground text-sm">
                  {new Date(ticket.createdAt).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tickets.length === 0 && (
          <EmptyState icon={Ticket} message="Nenhum ticket encontrado" />
        )}
      </div>
    </div>
  );
}
