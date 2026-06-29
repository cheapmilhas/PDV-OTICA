import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cross-tenant isolation tests for DELETE /api/users/[id]/permissions/reset
 * Pentest 2026-06-28: provar que um ADMIN da empresa A não pode resetar
 * permissões de um usuário da empresa B (IDOR via userId).
 */

// --- auth-helpers mock ---
const getCompanyIdMock = vi.fn();
const requireRoleMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  requireRole: (...a: unknown[]) => requireRoleMock(...a),
}));

// --- prisma mock ---
const userFindFirstMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => userFindFirstMock(...a) },
  },
}));

// --- permission service mock ---
// hoisted: vi.hoisted dá uma ref estável p/ o método, que a factory do vi.mock
// pode capturar (a factory é içada p/ antes dos imports). O construtor mockado
// é uma função regular que devolve sempre a mesma instância com o método.
const { resetMock } = vi.hoisted(() => ({ resetMock: vi.fn() }));
vi.mock("@/services/permission.service", () => ({
  PermissionService: vi.fn(function () {
    return { resetUserPermissionsToDefault: resetMock };
  }),
}));

import type { NextRequest } from "next/server";
import { DELETE } from "./route";
import { PermissionService } from "@/services/permission.service";

const MockedPermissionService = vi.mocked(PermissionService);

function makeDeleteRequest(userId: string): NextRequest {
  return new Request(
    `http://localhost/api/users/${userId}/permissions/reset`,
    { method: "DELETE" }
  ) as unknown as NextRequest;
}

describe("DELETE /api/users/[id]/permissions/reset — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCompanyIdMock.mockResolvedValue("company-A");
    requireRoleMock.mockResolvedValue(undefined);
    resetMock.mockResolvedValue(undefined);
  });

  it("404 quando usuário pertence a outra empresa (cross-tenant barrado)", async () => {
    // findFirst com { id: 'user-B', companyId: 'company-A' } retorna null
    userFindFirstMock.mockResolvedValue(null);

    const res = await DELETE(
      makeDeleteRequest("user-B"),
      { params: Promise.resolve({ id: "user-B" }) }
    );

    expect(res.status).toBe(404);

    // Reset não deve ter sido chamado
    expect(resetMock).not.toHaveBeenCalled();
    expect(MockedPermissionService).not.toHaveBeenCalled();
  });

  it("200 quando usuário pertence à mesma empresa (mesmo tenant aceito)", async () => {
    userFindFirstMock.mockResolvedValue({ id: "user-A" });

    const res = await DELETE(
      makeDeleteRequest("user-A"),
      { params: Promise.resolve({ id: "user-A" }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(resetMock).toHaveBeenCalledWith("user-A");
  });
});
