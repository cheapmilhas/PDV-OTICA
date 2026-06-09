type FreshClaims = {
  role: string;
  name: string;
  companyId: string;
  networkId: string | null;
  branchId?: string | null;
};

/**
 * Aplica claims revalidados ao token. Durante impersonação, a identidade
 * impersonada (company/branch/network/role/name) é FIXA — definida na criação
 * da sessão — e NÃO deve ser sobrescrita pelo `fresh` do usuário-alvo.
 */
export function applyRevalidatedClaims(
  token: Record<string, unknown>,
  fresh: FreshClaims,
  isImpersonating: boolean
): void {
  if (isImpersonating) return;
  token.companyId = fresh.companyId;
  token.networkId = fresh.networkId;
  token.role = fresh.role;
  token.name = fresh.name;
  if (fresh.branchId) token.branchId = fresh.branchId;
}
