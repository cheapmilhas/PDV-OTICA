// src/lib/resolve-stock-branch.ts
import type { Prisma } from "@prisma/client";
import { forbiddenError } from "@/lib/error-handler";

/** Papéis que podem gravar estoque numa filial diferente da própria. */
const CROSS_BRANCH_ROLES = ["ADMIN", "GERENTE"];

export interface StockActor {
  role: string;
  /** Filial da sessão do usuário; pode ser null (ex.: ADMIN sem filial fixa). */
  userBranchId: string | null;
}

/**
 * Resolve a filial-alvo para gravar BranchStock no cadastro/edição manual de
 * produto. Espelha resolveReportBranchId, mas: (1) roda DENTRO da tx do
 * create/update (a leitura de validação e o fallback usam a mesma tx do upsert
 * seguinte); (2) recebe o `actor` por parâmetro — a camada de service não
 * re-autentica.
 *
 * Regras:
 *  - sem branchId / "ALL" / == filial da sessão → filial da sessão (se houver).
 *    Se não houver filial de sessão → principal/mais antiga ativa.
 *  - branchId diferente → só ADMIN/GERENTE; valida que a filial pertence à
 *    empresa E está active; senão 403.
 *  - empresa sem filial ativa → null (chamador não grava BranchStock).
 *
 * O branchId do cliente é sugestão validada, NUNCA autoridade.
 */
export async function resolveStockBranchId(
  requestedBranchId: string | null | undefined,
  actor: StockActor,
  companyId: string,
  tx: Prisma.TransactionClient
): Promise<string | null> {
  const isSameAsSession =
    requestedBranchId != null &&
    actor.userBranchId != null &&
    requestedBranchId === actor.userBranchId;

  // Sem seletor (ou "ALL") ou pedindo a própria filial → filial da sessão.
  if (!requestedBranchId || requestedBranchId === "ALL" || isSameAsSession) {
    if (actor.userBranchId) return actor.userBranchId;
    // Sem filial de sessão (ex.: ADMIN "ALL"): cai na principal/mais antiga ativa.
    const main = await tx.branch.findFirst({
      where: { companyId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return main?.id ?? null;
  }

  // Trocar de filial é privilégio de ADMIN/GERENTE.
  if (!CROSS_BRANCH_ROLES.includes(actor.role)) {
    throw forbiddenError("Sem permissão para gravar estoque em outra filial.");
  }

  // Valida que a filial pertence à empresa e está ativa (anti-leak multi-tenant).
  const branch = await tx.branch.findFirst({
    where: { id: requestedBranchId, companyId, active: true },
    select: { id: true },
  });
  if (!branch) {
    throw forbiddenError("Filial inválida para esta empresa.");
  }
  return branch.id;
}
