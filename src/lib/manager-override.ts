import { prisma } from "@/lib/prisma";
import { AppError, ERROR_CODES } from "@/lib/error-handler";
import type { ManagerOverrideDTO } from "@/lib/validations/sale.schema";

/**
 * Re-valida no servidor que o `approvedByUserId` enviado pelo frontend pertence
 * a um ADMIN ou GERENTE da mesma empresa. Nunca confiamos apenas na resposta do
 * /api/auth/verify-manager (que o cliente poderia forjar) — checamos de novo
 * aqui antes de pular qualquer regra de negócio.
 *
 * Retorna o nome do autorizador (para auditoria) ou lança AppError 403.
 */
export async function assertValidManagerOverride(
  override: ManagerOverrideDTO,
  companyId: string
): Promise<{ approverName: string }> {
  const approver = await prisma.user.findFirst({
    where: {
      id: override.approvedByUserId,
      companyId,
      role: { in: ["ADMIN", "GERENTE"] },
    },
    select: { id: true, name: true },
  });

  if (!approver) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Autorização de gerente inválida. Refaça a autorização.",
      403
    );
  }

  return { approverName: approver.name ?? "Gerente" };
}

/** Conjunto de motivos autorizados, para checagem rápida no service. */
export function overrideAllows(
  override: ManagerOverrideDTO | undefined,
  reason: "CREDIT_LIMIT_EXCEEDED" | "CUSTOMER_OVERDUE" | "INSUFFICIENT_STOCK"
): boolean {
  return !!override?.reasons?.includes(reason);
}
