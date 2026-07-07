import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus, Ticket, Inbox, Loader, Clock, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { KPICard } from "@/components/admin/KPICard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

// Prioridade → cor do "dot" via token semântico (sem emoji, theme-aware).
const PRIORITY_DOT: Record<string, string> = {
  LOW: "bg-success",
  MEDIUM: "bg-warning",
  HIGH: "bg-warning",
  URGENT: "bg-destructive",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
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
          <Button asChild>
            <Link href="/admin/suporte/tickets/novo">
              <Plus className="w-4 h-4" />
              Novo Ticket
            </Link>
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard icon={Inbox} label="Abertos" value={String(openCount)} />
        <KPICard icon={Loader} label="Em Andamento" value={String(inProgressCount)} />
        <KPICard icon={Clock} label="Aguardando" value={String(waitingCount)} />
        <KPICard icon={CheckCircle} label="Resolvidos" value={String(resolvedCount)} />
      </div>

      {/* Tabela */}
      {tickets.length === 0 ? (
        <div className="bg-card rounded-xl border border-border">
          <EmptyState icon={Ticket} message="Nenhum ticket encontrado" />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <ResponsiveTable minWidth={720}>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Prior.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell>
                    <Link
                      href={`/admin/suporte/tickets/${ticket.id}`}
                      className="text-primary hover:text-primary font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {ticket.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/suporte/tickets/${ticket.id}`}
                      className="text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {ticket.subject}
                    </Link>
                    <p className="text-xs text-muted-foreground">{ticket.category}</p>
                  </TableCell>
                  <TableCell className="text-foreground">{ticket.company.tradeName}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${PRIORITY_DOT[ticket.priority] ?? "bg-muted-foreground"}`}
                      />
                      {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                    </span>
                  </TableCell>
                  <TableCell>
                    <AdminStatusBadge kind="ticket" status={ticket.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(ticket.createdAt).toLocaleDateString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        </div>
      )}
    </div>
  );
}
