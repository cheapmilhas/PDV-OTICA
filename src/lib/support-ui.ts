// Rótulos e estilos (flat design) de status/prioridade de ticket para a UI do cliente.
// Cor é o sinal principal de status; mantido acessível (contraste em tema claro/escuro)
// usando tokens do projeto. Não é a única pista (sempre acompanha texto).

export type TicketStatusUI = "OPEN" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
export type TicketPriorityUI = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export const TICKET_STATUS_LABEL: Record<TicketStatusUI, string> = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em andamento",
  WAITING_CUSTOMER: "Aguardando você",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
};

/** Classe de badge (flat, sem sombra) por status. */
export const TICKET_STATUS_CLASS: Record<TicketStatusUI, string> = {
  OPEN: "bg-primary/10 text-primary border border-primary/20",
  IN_PROGRESS: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  WAITING_CUSTOMER: "bg-warning/10 text-warning border border-warning/20",
  RESOLVED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  CLOSED: "bg-muted text-muted-foreground border border-border",
};

export const TICKET_PRIORITY_LABEL: Record<TicketPriorityUI, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const TICKET_PRIORITY_CLASS: Record<TicketPriorityUI, string> = {
  LOW: "bg-muted text-muted-foreground border border-border",
  MEDIUM: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  HIGH: "bg-warning/10 text-warning border border-warning/20",
  URGENT: "bg-destructive/10 text-destructive border border-destructive/20",
};

/** Status em que o cliente NÃO pode mais responder (deve abrir novo chamado). */
export function isTerminalTicketStatus(status: TicketStatusUI): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}

export function statusLabel(status: string): string {
  return TICKET_STATUS_LABEL[status as TicketStatusUI] ?? status;
}

export function statusClass(status: string): string {
  return TICKET_STATUS_CLASS[status as TicketStatusUI] ?? TICKET_STATUS_CLASS.CLOSED;
}

export function priorityLabel(priority: string): string {
  return TICKET_PRIORITY_LABEL[priority as TicketPriorityUI] ?? priority;
}

export function priorityClass(priority: string): string {
  return TICKET_PRIORITY_CLASS[priority as TicketPriorityUI] ?? TICKET_PRIORITY_CLASS.LOW;
}
