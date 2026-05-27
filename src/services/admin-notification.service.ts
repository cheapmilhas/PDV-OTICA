import { prisma } from "@/lib/prisma";
import { AdminNotificationType } from "@prisma/client";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "admin-notification" });

interface CreateNotificationParams {
  adminId?: string; // null = broadcast para todos os admins
  type: AdminNotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cria uma notificação interna para o painel admin.
 * Falha silenciosa — não deve quebrar a operação principal.
 */
export async function createAdminNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await prisma.adminNotification.create({
      data: {
        adminId: params.adminId ?? null,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link ?? null,
        ...(params.metadata && { metadata: JSON.parse(JSON.stringify(params.metadata)) }),
      },
    });
  } catch (error) {
    log.error("Falha ao criar notificação", { error: error instanceof Error ? error.message : String(error) });
  }
}
