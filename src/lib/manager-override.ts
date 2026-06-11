import { prisma } from "@/lib/prisma";
import { AppError, ERROR_CODES } from "@/lib/error-handler";
import type { ManagerOverrideDTO } from "@/lib/validations/sale.schema";

/**
 * Re-valida no servidor que o `approvedByUserId` enviado pelo frontend pertence
 * a um usuário da mesma empresa. A liberação não exige mais senha de gerente —
 * o próprio operador logado confirma e fica registrado como autorizador. Ainda
 * checamos aqui que o id é de um usuário real da empresa (nunca confiar só no
 * que o cliente enviou) antes de pular qualquer regra de negócio.
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
    },
    select: { id: true, name: true },
  });

  if (!approver) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Autorização inválida. Refaça a liberação.",
      403
    );
  }

  return { approverName: approver.name ?? "Operador" };
}

/** Conjunto de motivos autorizados, para checagem rápida no service. */
export function overrideAllows(
  override: ManagerOverrideDTO | undefined,
  reason:
    | "CREDIT_LIMIT_EXCEEDED"
    | "CUSTOMER_OVERDUE"
    | "INSUFFICIENT_STOCK"
    | "DISCOUNT_EXCEEDS_LIMIT"
    | "PRICE_BELOW_COST"
): boolean {
  return !!override?.reasons?.includes(reason);
}
