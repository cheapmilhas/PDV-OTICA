// src/lib/__tests__/resolve-stock-branch.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const txMock: any = {
  branch: { findFirst: vi.fn(), findMany: vi.fn() },
};

import { resolveStockBranchId } from "@/lib/resolve-stock-branch";

type Actor = { role: string; userBranchId: string | null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveStockBranchId", () => {
  const companyId = "company_1";

  it("sem branchId → filial da sessão do actor", async () => {
    const actor: Actor = { role: "VENDEDOR", userBranchId: "branch_user" };
    const result = await resolveStockBranchId(undefined, actor, companyId, txMock);
    expect(result).toBe("branch_user");
    expect(txMock.branch.findFirst).not.toHaveBeenCalled();
  });

  it("branchId == filial da sessão → filial da sessão (sem checar papel)", async () => {
    const actor: Actor = { role: "CAIXA", userBranchId: "branch_user" };
    const result = await resolveStockBranchId("branch_user", actor, companyId, txMock);
    expect(result).toBe("branch_user");
  });

  it("ADMIN pode escolher outra filial da empresa (active)", async () => {
    const actor: Actor = { role: "ADMIN", userBranchId: "branch_user" };
    txMock.branch.findFirst.mockResolvedValue({ id: "branch_2" });
    const result = await resolveStockBranchId("branch_2", actor, companyId, txMock);
    expect(result).toBe("branch_2");
    expect(txMock.branch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "branch_2", companyId, active: true },
      })
    );
  });

  it("VENDEDOR tentando outra filial → 403", async () => {
    const actor: Actor = { role: "VENDEDOR", userBranchId: "branch_user" };
    await expect(
      resolveStockBranchId("branch_2", actor, companyId, txMock)
    ).rejects.toThrow(/permissão/i);
  });

  it("ADMIN pedindo filial de outra empresa/inativa → 403", async () => {
    const actor: Actor = { role: "ADMIN", userBranchId: "branch_user" };
    txMock.branch.findFirst.mockResolvedValue(null);
    await expect(
      resolveStockBranchId("branch_alheia", actor, companyId, txMock)
    ).rejects.toThrow(/filial inválida/i);
  });

  it("ADMIN com userBranchId null e branchId 'ALL' → principal/mais antiga ativa", async () => {
    const actor: Actor = { role: "ADMIN", userBranchId: null };
    txMock.branch.findFirst.mockResolvedValue({ id: "branch_main" });
    const result = await resolveStockBranchId("ALL", actor, companyId, txMock);
    expect(result).toBe("branch_main");
    expect(txMock.branch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId, active: true },
        orderBy: { createdAt: "asc" },
      })
    );
  });

  it("empresa sem filial ativa → null", async () => {
    const actor: Actor = { role: "ADMIN", userBranchId: null };
    txMock.branch.findFirst.mockResolvedValue(null);
    const result = await resolveStockBranchId(undefined, actor, companyId, txMock);
    expect(result).toBeNull();
  });
});
