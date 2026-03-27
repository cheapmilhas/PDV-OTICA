import { prisma } from "@/lib/prisma";
import { ActivityType, ActorType } from "@prisma/client";

interface LogActivityParams {
  companyId: string;
  type: ActivityType;
  title: string;
  detail?: Record<string, unknown>;
  actorId?: string;
  actorType?: ActorType;
  actorName?: string;
}

/**
 * Registra uma entrada na timeline de atividades de uma empresa.
 * Falha silenciosa — não deve quebrar a operação principal.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        companyId: params.companyId,
        type: params.type,
        title: params.title,
        ...(params.detail && { detail: JSON.parse(JSON.stringify(params.detail)) }),
        actorId: params.actorId ?? null,
        actorType: params.actorType ?? ActorType.SYSTEM,
        actorName: params.actorName ?? null,
      },
    });
  } catch (error) {
    // Log silencioso — atividade não deve quebrar o fluxo principal
    console.error("[ActivityLog] Falha ao registrar atividade:", error);
  }
}
