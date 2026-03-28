import { prisma } from "@/lib/prisma";
import { AppError, ERROR_CODES } from "@/lib/error-handler";

/**
 * Valida que um branchId pertence ao companyId informado.
 * Lança AppError se a branch não existir ou não pertencer à empresa.
 *
 * Use em todos os endpoints que recebem branchId do body do request
 * antes de qualquer operação de escrita no banco.
 */
export async function validateBranchOwnership(
  branchId: string,
  companyId: string
): Promise<void> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { companyId: true },
  });

  if (!branch || branch.companyId !== companyId) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Filial não pertence à empresa do usuário",
      403
    );
  }
}
