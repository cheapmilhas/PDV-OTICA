import { z } from "zod";

/**
 * Prioridades que o CLIENTE pode escolher ao abrir um ticket.
 * URGENT fica de fora de propósito (C2): só o admin reclassifica para urgente,
 * senão toda ótica abriria tudo como URGENT e estouraria SLA/sino do admin.
 */
export const clientTicketPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM");

export const createClientTicketSchema = z.object({
  subject: z.string().trim().min(1, "Assunto é obrigatório").max(200),
  description: z.string().trim().min(1, "Descrição é obrigatória").max(5000),
  priority: clientTicketPrioritySchema,
});

export const clientTicketMessageSchema = z.object({
  message: z.string().trim().min(1, "Mensagem não pode estar vazia").max(5000),
});

export type CreateClientTicketInput = z.infer<typeof createClientTicketSchema>;
export type ClientTicketMessageInput = z.infer<typeof clientTicketMessageSchema>;
