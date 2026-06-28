import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cross-tenant isolation tests for
 * POST /api/admin/companies/[id]/users/[userId]/reset-password
 * Pentest 2026-06-28: provar que um admin sem escopo para a empresa alvo
 * recebe 403 e que nenhum hash de senha é alterado.
 */

// --- admin-session mock ---
const getAdminSessionMock = vi.fn();
const requireCompanyScopeMock = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: (...a: unknown[]) => getAdminSessionMock(...a),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScopeMock(...a),
}));

// --- rate-limit passthrough (não bloquear nos testes) ---
vi.mock("@/lib/rate-limit", () => ({
  adminRateLimit: () => null,
}));

// --- bcrypt mock (evitar trabalho de hash real no teste) ---
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-password") },
}));

// --- prisma mock ---
const userFindFirstMock = vi.fn();
const txUserUpdateMock = vi.fn();
const txGlobalAuditCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => userFindFirstMock(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}));

import type { NextRequest } from "next/server";
import { POST } from "./route";

function makePostRequest(companyId: string, userId: string, body: unknown = {}): NextRequest {
  return new Request(
    `http://localhost/api/admin/companies/${companyId}/users/${userId}/reset-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  ) as unknown as NextRequest;
}

describe("POST /admin/companies/[id]/users/[userId]/reset-password — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Sessão admin válida por padrão
    getAdminSessionMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@vis.app.br",
      role: "SUPER_ADMIN",
    });

    // Transação executa o callback
    transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        user: { update: txUserUpdateMock },
        globalAudit: { create: txGlobalAuditCreateMock },
      };
      return cb(tx);
    });
    txUserUpdateMock.mockResolvedValue({});
    txGlobalAuditCreateMock.mockResolvedValue({});
  });

  it("403 quando admin não tem escopo para a empresa alvo (cross-tenant barrado)", async () => {
    // requireCompanyScope retorna null/false → acesso negado
    requireCompanyScopeMock.mockResolvedValue(null);

    const res = await POST(
      makePostRequest("company-B", "user-B", { newPassword: "SenhaForte1!" }),
      { params: Promise.resolve({ id: "company-B", userId: "user-B" }) }
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/sem permissão/i);

    // Nenhuma escrita deve ter ocorrido
    expect(txUserUpdateMock).not.toHaveBeenCalled();
    expect(txGlobalAuditCreateMock).not.toHaveBeenCalled();
  });

  it("200 quando admin tem escopo correto para a empresa (mesmo escopo aceito)", async () => {
    requireCompanyScopeMock.mockResolvedValue({ id: "admin-1", role: "SUPER_ADMIN" });
    userFindFirstMock.mockResolvedValue({
      id: "user-A",
      email: "user@company-a.com",
      name: "Usuário A",
    });

    const res = await POST(
      makePostRequest("company-A", "user-A", { newPassword: "SenhaForte1!" }),
      { params: Promise.resolve({ id: "company-A", userId: "user-A" }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(txUserUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-A" } })
    );
    expect(txGlobalAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "USER_PASSWORD_RESET" }),
      })
    );
  });

  it("404 quando userId não pertence à empresa (segunda camada de proteção)", async () => {
    // Escopo ok, mas usuário não é da empresa
    requireCompanyScopeMock.mockResolvedValue({ id: "admin-1", role: "SUPER_ADMIN" });
    userFindFirstMock.mockResolvedValue(null);

    const res = await POST(
      makePostRequest("company-A", "user-B", {}),
      { params: Promise.resolve({ id: "company-A", userId: "user-B" }) }
    );

    expect(res.status).toBe(404);
    expect(txUserUpdateMock).not.toHaveBeenCalled();
  });
});
