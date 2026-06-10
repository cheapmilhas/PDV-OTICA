import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SEC-004 (Fase 1): validateBranchOwnership garante que um branchId pertence à
 * empresa do usuário antes de ler/escrever — bloqueia cruzamento entre filiais
 * de empresas/redes diferentes com 403.
 */

const branchFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { branch: { findUnique: (...a: unknown[]) => branchFindUnique(...a) } },
}));

import { validateBranchOwnership } from "./validate-branch";

describe("SEC-004: validateBranchOwnership", () => {
  beforeEach(() => branchFindUnique.mockReset());

  it("passa quando a filial pertence à empresa", async () => {
    branchFindUnique.mockResolvedValue({ companyId: "company-1" });
    await expect(
      validateBranchOwnership("branch-1", "company-1")
    ).resolves.toBeUndefined();
  });

  it("lança 403 quando a filial é de OUTRA empresa", async () => {
    branchFindUnique.mockResolvedValue({ companyId: "company-OUTRA" });
    await expect(
      validateBranchOwnership("branch-x", "company-1")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lança 403 quando a filial não existe", async () => {
    branchFindUnique.mockResolvedValue(null);
    await expect(
      validateBranchOwnership("inexistente", "company-1")
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
