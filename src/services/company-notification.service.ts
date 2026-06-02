import { prisma } from "@/lib/prisma";
import { CompanyNotificationType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "company-notification" });

/**
 * Filtro de escopo das notificações servidas ao cliente (H2 da review de plano).
 * SEMPRE preso à empresa do usuário; broadcast (userId=null) só vale dentro dela.
 * Função pura, testável — as 3 rotas reusam para não divergir.
 */
export function companyNotificationScope(
  companyId: string,
  userId: string
): Prisma.CompanyNotificationWhereInput {
  return {
    companyId,
    OR: [{ userId }, { userId: null }],
  };
}

interface CreateCompanyNotificationParams {
  companyId: string;
  /** null/omitido = broadcast para toda a empresa. Para ticket, usar o autor do ticket. */
  userId?: string | null;
  type: CompanyNotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cria uma notificação in-app para o lado do cliente (dono da ótica).
 * Falha silenciosa — NUNCA deve quebrar a operação principal (criar/responder ticket).
 *
 * IMPORTANTE: chame SEMPRE após o commit da transação que gera o evento — nunca
 * dentro da $transaction (uma falha de notificação não pode causar rollback do ticket).
 */
export async function createCompanyNotification(
  params: CreateCompanyNotificationParams
): Promise<void> {
  try {
    await prisma.companyNotification.create({
      data: {
        companyId: params.companyId,
        userId: params.userId ?? null,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link ?? null,
        ...(params.metadata && { metadata: JSON.parse(JSON.stringify(params.metadata)) }),
      },
    });
  } catch (error) {
    log.error("Falha ao criar notificação do cliente", {
      error: error instanceof Error ? error.message : String(error),
      companyId: params.companyId,
      type: params.type,
    });
  }
}
