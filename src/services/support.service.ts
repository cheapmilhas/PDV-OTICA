import { prisma } from "@/lib/prisma";
import {
  TicketPriority,
  TicketStatus,
  ActivityType,
  ActorType,
  AdminNotificationType,
  CompanyNotificationType,
  type Prisma,
  type SupportTicket,
} from "@prisma/client";
import { logActivity } from "@/services/activity-log.service";
import { createAdminNotification } from "@/services/admin-notification.service";
import { createCompanyNotification } from "@/services/company-notification.service";
import { AppError } from "@/lib/error-handler";
import { ERROR_CODES } from "@/lib/error-handler";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "support" });

type Tx = Prisma.TransactionClient;

/** Status terminais: cliente não responde; deve abrir novo chamado. */
const TERMINAL_STATUSES: TicketStatus[] = ["RESOLVED", "CLOSED"];

/** Fallback de SLA (horas até a resolução) por prioridade, se não houver SLAPolicy. */
export const SLA_FALLBACK_HOURS: Record<TicketPriority, number> = {
  URGENT: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 48,
};

/** Soma puramente as horas de SLA a uma data base (testável sem banco). */
export function addSlaHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

/** Status terminais expostos para teste/UI: cliente não responde nesses. */
export function isTerminalStatus(status: TicketStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Categoria fixa para tickets abertos pelo cliente (paridade com o admin). */
const CLIENT_TICKET_CATEGORY = "SUPORTE";

/**
 * Calcula o slaDeadline a partir da SLAPolicy da prioridade (resolutionH);
 * cai no fallback em código se não houver política cadastrada.
 */
export async function computeSlaDeadline(
  priority: TicketPriority,
  from: Date,
  tx: Tx
): Promise<Date> {
  const policy = await tx.sLAPolicy.findFirst({
    where: { priority },
    orderBy: { isDefault: "desc" },
    select: { resolutionH: true },
  });
  const hours = policy?.resolutionH ?? SLA_FALLBACK_HOURS[priority];
  return addSlaHours(from, hours);
}

/**
 * Gera um número sequencial de ticket. Tem corrida sob concorrência (count+1);
 * por isso a criação roda dentro de withTicketNumberRetry (trata P2002).
 */
async function nextTicketNumber(tx: Tx): Promise<string> {
  const count = await tx.supportTicket.count();
  return `TKT-${String(count + 1).padStart(5, "0")}`;
}

function isP2002(error: unknown): boolean {
  return (
    error instanceof Object &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Executa uma criação de ticket com retry em caso de colisão do número
 * sequencial (@unique). Compartilhado pelo caminho do cliente E do admin (H3).
 */
async function withTicketNumberRetry<T>(fn: () => Promise<T>): Promise<T> {
  const MAX_RETRIES = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (isP2002(error) && attempt < MAX_RETRIES - 1) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  log.error("Falha ao criar ticket após retries", {
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError;
}

interface CreateTicketByClientParams {
  companyId: string;
  userId: string;
  subject: string;
  description: string;
  /** já validada pela rota (sem URGENT); default MEDIUM. */
  priority: TicketPriority;
  authorName: string;
}

/**
 * Cliente abre um ticket. Cria ticket OPEN + 1ª mensagem (CLIENT, isInternal=false),
 * seta slaDeadline. Notifica o admin (sino acende) APÓS o commit. Trata P2002 do
 * número sequencial com retry.
 */
export async function createTicketByClient(
  params: CreateTicketByClientParams
): Promise<SupportTicket> {
  const ticket = await withTicketNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const number = await nextTicketNumber(tx);
      const slaDeadline = await computeSlaDeadline(params.priority, new Date(), tx);

      const created = await tx.supportTicket.create({
        data: {
          companyId: params.companyId,
          userId: params.userId,
          number,
          subject: params.subject,
          description: params.description,
          category: CLIENT_TICKET_CATEGORY,
          priority: params.priority,
          status: "OPEN",
          slaDeadline,
          messages: {
            create: {
              authorId: params.userId,
              authorName: params.authorName,
              authorType: "CLIENT",
              message: params.description,
              isInternal: false,
            },
          },
        },
      });

      await logActivity({
        companyId: params.companyId,
        type: ActivityType.TICKET_OPENED,
        title: `Ticket #${number} aberto pelo cliente: ${params.subject}`,
        actorId: params.userId,
        actorType: ActorType.CLIENT,
        actorName: params.authorName,
      });

      return created;
    })
  );

  // Notificação ao admin FORA da transação (pós-commit, fail-silent — H4).
  // O enum AdminNotificationType só tem TICKET_URGENT para suporte; serve
  // como "novo ticket" no sino do admin independente da prioridade.
  await createAdminNotification({
    type: AdminNotificationType.TICKET_URGENT,
    title: `Novo ticket #${ticket.number}`,
    message: `${params.authorName}: ${params.subject}`,
    link: `/admin/suporte/tickets/${ticket.id}`,
    metadata: { ticketId: ticket.id, number: ticket.number, companyId: params.companyId },
  });

  return ticket;
}

interface CreateTicketByAdminParams {
  companyId: string;
  /** usuário da empresa ao qual o ticket fica vinculado (autor). */
  userId: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  assignedToId?: string;
  admin: { id: string; name: string };
}

/**
 * Admin abre um ticket para uma empresa. Cria ticket OPEN + 1ª mensagem (ADMIN,
 * pública), seta slaDeadline. Mesmo retry de número do caminho do cliente (H3).
 * Não notifica o admin (foi ele quem abriu); notifica o autor (cliente) pós-commit.
 */
export async function createTicketByAdmin(
  params: CreateTicketByAdminParams
): Promise<SupportTicket> {
  const ticket = await withTicketNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const number = await nextTicketNumber(tx);
      const slaDeadline = await computeSlaDeadline(params.priority, new Date(), tx);

      const created = await tx.supportTicket.create({
        data: {
          companyId: params.companyId,
          userId: params.userId,
          number,
          subject: params.subject,
          description: params.description,
          category: CLIENT_TICKET_CATEGORY,
          priority: params.priority,
          status: "OPEN",
          slaDeadline,
          ...(params.assignedToId ? { assignedToId: params.assignedToId } : {}),
          messages: {
            create: {
              authorId: params.admin.id,
              authorName: params.admin.name,
              authorType: "ADMIN",
              message: params.description,
              isInternal: false,
            },
          },
        },
      });

      await logActivity({
        companyId: params.companyId,
        type: ActivityType.TICKET_OPENED,
        title: `Ticket #${number} aberto: ${params.subject}`,
        actorId: params.admin.id,
        actorType: ActorType.ADMIN,
        actorName: params.admin.name,
      });

      return created;
    })
  );

  // Cliente (autor) é notificado de que há um chamado aberto em nome dele.
  await createCompanyNotification({
    companyId: params.companyId,
    userId: params.userId,
    type: CompanyNotificationType.TICKET_STATUS,
    title: `Chamado #${ticket.number} aberto pelo suporte`,
    message: params.subject,
    link: `/dashboard/suporte/${ticket.id}`,
    metadata: { ticketId: ticket.id, number: ticket.number },
  });

  return ticket;
}

interface AddClientMessageParams {
  ticketId: string;
  companyId: string;
  userId: string;
  authorName: string;
  message: string;
}

/**
 * Cliente responde um ticket. Valida que o ticket pertence à sua empresa.
 * Bloqueia resposta em ticket terminal (RESOLVED/CLOSED → 409). Se estava em
 * WAITING_CUSTOMER, volta a OPEN. Notifica o admin pós-commit.
 */
export async function addClientMessage(params: AddClientMessageParams) {
  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({
      where: { id: params.ticketId, companyId: params.companyId },
      select: { id: true, number: true, status: true, subject: true },
    });
    if (!ticket) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "Ticket não encontrado", 404);
    }
    if (isTerminalStatus(ticket.status)) {
      throw new AppError(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        "Este chamado está encerrado. Abra um novo chamado para continuar.",
        409
      );
    }

    const message = await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: params.userId,
        authorName: params.authorName,
        authorType: "CLIENT",
        message: params.message,
        isInternal: false,
      },
      // Projeta só o que o cliente pode ver (HIGH: nunca devolve isInternal/authorId
      // na resposta da rota — espelha o select do GET detalhe).
      select: {
        id: true,
        authorType: true,
        authorName: true,
        message: true,
        attachments: true,
        createdAt: true,
      },
    });

    // Cliente respondeu → reabre se aguardava resposta dele.
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        updatedAt: new Date(),
        ...(ticket.status === "WAITING_CUSTOMER" && { status: "OPEN" }),
      },
    });

    return { ticket, message };
  });

  // Notifica o admin pós-commit (sino acende).
  await createAdminNotification({
    type: AdminNotificationType.TICKET_URGENT,
    title: `Resposta no ticket #${result.ticket.number}`,
    message: `${params.authorName} respondeu: ${result.ticket.subject}`,
    link: `/admin/suporte/tickets/${result.ticket.id}`,
    metadata: { ticketId: result.ticket.id, number: result.ticket.number },
  });

  return result.message;
}

interface AddAdminMessageParams {
  ticketId: string;
  adminId: string;
  adminName: string;
  message: string;
  isInternal: boolean;
}

/**
 * Admin responde um ticket. Seta firstResponseAt na 1ª resposta do admin (só se
 * null e se a mensagem NÃO for interna). Notifica o autor do ticket (cliente)
 * pós-commit — exceto em nota interna. Assume escopo já validado pela rota.
 */
export async function addAdminMessage(params: AddAdminMessageParams) {
  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: params.ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        companyId: true,
        userId: true,
        firstResponseAt: true,
      },
    });
    if (!ticket) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "Ticket não encontrado", 404);
    }

    const message = await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: params.adminId,
        authorName: params.adminName,
        authorType: "ADMIN",
        message: params.message,
        isInternal: params.isInternal,
      },
    });

    // firstResponseAt: só na 1ª resposta PÚBLICA do admin (M1).
    const setFirstResponse = !ticket.firstResponseAt && !params.isInternal;
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        updatedAt: new Date(),
        ...(setFirstResponse && { firstResponseAt: new Date() }),
      },
    });

    return { ticket, message };
  });

  // Notifica o cliente (autor do ticket) pós-commit — nunca em nota interna (M4).
  if (!params.isInternal) {
    await createCompanyNotification({
      companyId: result.ticket.companyId,
      userId: result.ticket.userId,
      type: CompanyNotificationType.TICKET_REPLY,
      title: `Suporte respondeu seu chamado #${result.ticket.number}`,
      message: result.ticket.subject,
      link: `/dashboard/suporte/${result.ticket.id}`,
      metadata: { ticketId: result.ticket.id, number: result.ticket.number },
    });
  }

  return result.message;
}

interface UpdateTicketStatusParams {
  ticketId: string;
  status: TicketStatus;
}

/**
 * Atualiza o status do ticket. Seta resolvedAt em RESOLVED/CLOSED. Notifica o
 * autor do ticket pós-commit. Assume escopo já validado pela rota.
 */
export async function updateTicketStatus(params: UpdateTicketStatusParams) {
  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: params.ticketId },
      select: { id: true, number: true, subject: true, companyId: true, userId: true },
    });
    if (!ticket) {
      throw new AppError(ERROR_CODES.NOT_FOUND, "Ticket não encontrado", 404);
    }

    const isTerminal = isTerminalStatus(params.status);
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: params.status,
        // HIGH: terminal → carimba resolvedAt; reabertura → limpa (sem timestamp velho).
        resolvedAt: isTerminal ? new Date() : null,
      },
    });

    return { ticket, updated };
  });

  await createCompanyNotification({
    companyId: result.ticket.companyId,
    userId: result.ticket.userId,
    type: CompanyNotificationType.TICKET_STATUS,
    title: `Status do chamado #${result.ticket.number} atualizado`,
    message: `Novo status: ${statusLabel(params.status)}`,
    link: `/dashboard/suporte/${result.ticket.id}`,
    metadata: { ticketId: result.ticket.id, status: params.status },
  });

  return result.updated;
}

function statusLabel(status: TicketStatus): string {
  const labels: Record<TicketStatus, string> = {
    OPEN: "Aberto",
    IN_PROGRESS: "Em andamento",
    WAITING_CUSTOMER: "Aguardando você",
    RESOLVED: "Resolvido",
    CLOSED: "Encerrado",
  };
  return labels[status] ?? status;
}
