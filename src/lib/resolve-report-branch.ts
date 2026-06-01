import { prisma } from "@/lib/prisma";
import { requireAuth, getBranchId } from "@/lib/auth-helpers";
import { forbiddenError } from "@/lib/error-handler";

/** Papéis que podem trocar de filial nos relatórios (ver outras lojas). */
const CROSS_BRANCH_ROLES = ["ADMIN", "GERENTE"];

/**
 * M3: resolve a filial a usar num relatório respeitando o SELETOR da UI.
 *
 * As rotas de relatório usavam getBranchId() (filial fixa da sessão) e
 * ignoravam o branchId enviado no querystring — então um admin multi-loja
 * sempre via a própria filial, nunca a selecionada.
 *
 * Regras:
 *  - sem branchId no querystring (ou "ALL") → cai na filial da sessão. (O modo
 *    consolidado de TODAS as filiais exigiria branchId nullable em todo o
 *    reports.service; fica como dívida — ver memória M3.)
 *  - com branchId → só ADMIN/GERENTE podem trocar de filial (vendedor/caixa/
 *    atendente ficam restritos à própria loja); valida que a filial pertence à
 *    empresa do usuário (anti-leak multi-tenant); senão 403.
 *
 * Retorna o branchId resolvido (string).
 */
export async function resolveReportBranchId(
  searchParams: URLSearchParams,
): Promise<string> {
  const session = await requireAuth();
  const requested = searchParams.get("branchId");

  // Sem seletor (ou "ALL") → filial da sessão.
  if (!requested || requested === "ALL" || requested === session.user.branchId) {
    return getBranchId();
  }

  // Trocar de filial é privilégio de ADMIN/GERENTE.
  if (!CROSS_BRANCH_ROLES.includes(session.user.role)) {
    throw forbiddenError("Sem permissão para ver relatório de outra filial.");
  }

  // Valida que a filial pertence à empresa (anti-leak multi-tenant).
  const branch = await prisma.branch.findFirst({
    where: { id: requested, companyId: session.user.companyId },
    select: { id: true },
  });
  if (!branch) {
    throw forbiddenError("Filial inválida para esta empresa.");
  }
  return branch.id;
}

/**
 * Variante que suporta o modo CONSOLIDADO ("ALL" → sem filtro de filial) para
 * relatórios cujo agregado já é por companyId. Retorna `{ branchId }` para uma
 * filial específica (validada + guard de papel) ou `{}` para consolidado.
 *
 * - sem branchId → filial da sessão (comportamento restrito padrão).
 * - "ALL" → consolidado, mas SÓ ADMIN/GERENTE; demais caem na própria filial.
 * - branchId específico → ADMIN/GERENTE only + validação de empresa.
 */
export async function resolveReportBranchFilter(
  searchParams: URLSearchParams,
): Promise<{ branchId?: string }> {
  const session = await requireAuth();
  const requested = searchParams.get("branchId");
  const isCrossBranch = CROSS_BRANCH_ROLES.includes(session.user.role);

  if (!requested || requested === session.user.branchId) {
    return { branchId: await getBranchId() };
  }

  if (requested === "ALL") {
    // Consolidado é privilégio de ADMIN/GERENTE; demais ficam na própria filial.
    return isCrossBranch ? {} : { branchId: await getBranchId() };
  }

  if (!isCrossBranch) {
    throw forbiddenError("Sem permissão para ver relatório de outra filial.");
  }

  const branch = await prisma.branch.findFirst({
    where: { id: requested, companyId: session.user.companyId },
    select: { id: true },
  });
  if (!branch) {
    throw forbiddenError("Filial inválida para esta empresa.");
  }
  return { branchId: branch.id };
}
