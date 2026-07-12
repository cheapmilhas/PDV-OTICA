import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * PATCH /api/admin/companies/[id]/users/[userId]
 * Fase 2, Task 3:
 *  - BUG-1: login (email) é read-only no super admin → removido do schema.
 *    Conta de login-curto (ex.: "matheusr@login") não deve ser rejeitada.
 *  - recoveryEmail editável: persiste valor e LIMPA (→ null) com string vazia.
 *  - BUG-2: sem checagem global de email duplicado (removida junto com o email).
 */

// --- admin-session mock ---
const getAdminSessionMock = vi.fn();
const requireCompanyScopeMock = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: (...a: unknown[]) => getAdminSessionMock(...a),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScopeMock(...a),
}));

// --- logger passthrough ---
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
}));

// --- prisma mock ---
const userFindFirstMock = vi.fn();
const txUserUpdateMock = vi.fn();
const txUserBranchDeleteManyMock = vi.fn();
const txUserBranchCreateMock = vi.fn();
const txGlobalAuditCreateMock = vi.fn();
const txBranchFindFirstMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => userFindFirstMock(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}));

import type { NextRequest } from "next/server";
import { PATCH } from "./route";

function makePatchRequest(companyId: string, userId: string, body: unknown = {}): NextRequest {
  return new Request(
    `http://localhost/api/admin/companies/${companyId}/users/${userId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  ) as unknown as NextRequest;
}

describe("PATCH /admin/companies/[id]/users/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getAdminSessionMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@vis.app.br",
      role: "SUPER_ADMIN",
    });
    requireCompanyScopeMock.mockResolvedValue({ id: "admin-1", role: "SUPER_ADMIN" });

    // Usuário-alvo: login-curto (não é email válido)
    userFindFirstMock.mockResolvedValue({
      id: "user-A",
      companyId: "company-A",
      email: "matheusr@login",
      name: "Matheus",
      role: "VENDEDOR",
      active: true,
    });

    transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        user: { update: txUserUpdateMock },
        userBranch: {
          deleteMany: txUserBranchDeleteManyMock,
          create: txUserBranchCreateMock,
        },
        branch: { findFirst: txBranchFindFirstMock },
        globalAudit: { create: txGlobalAuditCreateMock },
      };
      return cb(tx);
    });
    // Padrão: a filial existe e pertence à empresa.
    txBranchFindFirstMock.mockResolvedValue({ id: "branch-A" });
    txUserUpdateMock.mockImplementation(async (args: any) => ({
      id: "user-A",
      email: "matheusr@login",
      name: "X",
      role: "VENDEDOR",
      active: true,
      ...args.data,
    }));
    txUserBranchDeleteManyMock.mockResolvedValue({});
    txUserBranchCreateMock.mockResolvedValue({});
    txGlobalAuditCreateMock.mockResolvedValue({});
  });

  it("200 ao editar usuário de login-curto sem tocar no email", async () => {
    const res = await PATCH(
      makePatchRequest("company-A", "user-A", { name: "Novo Nome" }),
      { params: Promise.resolve({ id: "company-A", userId: "user-A" }) }
    );

    expect(res.status).toBe(200);
    expect(txUserUpdateMock).toHaveBeenCalledTimes(1);
    const updateArgs = txUserUpdateMock.mock.calls[0][0];
    // update NÃO deve conter a chave email (login é read-only)
    expect(updateArgs.data).not.toHaveProperty("email");
    expect(updateArgs.data).toMatchObject({ name: "Novo Nome" });
  });

  it("persiste recoveryEmail quando informado", async () => {
    const res = await PATCH(
      makePatchRequest("company-A", "user-A", { recoveryEmail: "x@y.com" }),
      { params: Promise.resolve({ id: "company-A", userId: "user-A" }) }
    );

    expect(res.status).toBe(200);
    const updateArgs = txUserUpdateMock.mock.calls[0][0];
    expect(updateArgs.data).toMatchObject({ recoveryEmail: "x@y.com" });
  });

  it("LIMPA recoveryEmail (→ null) quando enviado vazio (não é no-op)", async () => {
    const res = await PATCH(
      makePatchRequest("company-A", "user-A", { recoveryEmail: "" }),
      { params: Promise.resolve({ id: "company-A", userId: "user-A" }) }
    );

    expect(res.status).toBe(200);
    const updateArgs = txUserUpdateMock.mock.calls[0][0];
    expect(updateArgs.data).toHaveProperty("recoveryEmail", null);
  });

  it("400 quando recoveryEmail é inválido", async () => {
    const res = await PATCH(
      makePatchRequest("company-A", "user-A", { recoveryEmail: "nao-email" }),
      { params: Promise.resolve({ id: "company-A", userId: "user-A" }) }
    );

    expect(res.status).toBe(400);
    expect(txUserUpdateMock).not.toHaveBeenCalled();
  });

  it("400 quando branchId não pertence à empresa (multi-tenant)", async () => {
    // Filial de OUTRO tenant → findFirst { id, companyId } não acha → INVALID_BRANCH → 400.
    txBranchFindFirstMock.mockResolvedValueOnce(null);
    const res = await PATCH(
      makePatchRequest("company-A", "user-A", { branchId: "branch-de-outra-empresa" }),
      { params: Promise.resolve({ id: "company-A", userId: "user-A" }) }
    );

    expect(res.status).toBe(400);
    // NÃO deve ter vinculado o usuário à filial de outra empresa.
    expect(txUserBranchCreateMock).not.toHaveBeenCalled();
  });
});
