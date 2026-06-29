import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cross-tenant isolation tests for POST /api/cashback/customer/[customerId]
 * Pentest 2026-06-28: provar que um usuário da empresa A não pode ajustar
 * cashback de um cliente da empresa B (IDOR via customerId).
 */

// --- auth-permissions mock (requirePermission vem daqui nesta rota) ---
const requirePermissionMock = vi.fn();
vi.mock("@/lib/auth-permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

// --- auth-helpers mock ---
const getCompanyIdMock = vi.fn();
const getBranchIdMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi.fn().mockResolvedValue(undefined),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  getBranchId: (...a: unknown[]) => getBranchIdMock(...a),
}));

// --- prisma mock ---
const customerFindFirstMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findFirst: (...a: unknown[]) => customerFindFirstMock(...a) },
  },
}));

// --- cashback service mock ---
const adjustCashbackMock = vi.fn();
vi.mock("@/services/cashback.service", () => ({
  cashbackService: {
    adjustCashback: (...a: unknown[]) => adjustCashbackMock(...a),
    getCustomerCashback: vi.fn().mockResolvedValue({ balance: 0 }),
    getCustomerHistory: vi.fn().mockResolvedValue({ data: [], pagination: {} }),
  },
}));

import type { NextRequest } from "next/server";
import { POST } from "./route";

function makePostRequest(customerId: string, body: unknown): NextRequest {
  return new Request(`http://localhost/api/cashback/customer/${customerId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

// adjustCashbackSchema exige: customerId (cuid), amount!=0, type (BONUS|ADJUSTMENT|CORRECTION), description (min 3).
// O customerId é SOBRESCRITO pelo params via { ...body, customerId } na rota,
// portanto o ID nos params também precisa ser um cuid válido.
const CUID_A = "cld7z5kcv0000ujsgelkgaaaa"; // customer da empresa A
const CUID_B = "cld7z5kcv0001ujsgelkgbbbb"; // customer da empresa B

const validAdjustBody = {
  customerId: CUID_A, // será sobrescrito pelo params, mas deve ser cuid para passar no schema
  type: "ADJUSTMENT",
  amount: 10,
  description: "Ajuste manual de teste",
};

describe("POST /api/cashback/customer/[customerId] — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue(undefined);
    getCompanyIdMock.mockResolvedValue("company-A");
    getBranchIdMock.mockResolvedValue("branch-A");
  });

  it("404 quando cliente pertence a outra empresa (cross-tenant barrado)", async () => {
    // findFirst com { id: CUID_B, companyId: 'company-A' } retorna null
    customerFindFirstMock.mockResolvedValue(null);

    const res = await POST(
      makePostRequest(CUID_B, { ...validAdjustBody, customerId: CUID_B }),
      { params: Promise.resolve({ customerId: CUID_B }) }
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/não encontrado/i);

    // Nenhum ajuste deve ter sido executado
    expect(adjustCashbackMock).not.toHaveBeenCalled();
  });

  it("200 quando cliente pertence à mesma empresa (mesmo tenant aceito)", async () => {
    customerFindFirstMock.mockResolvedValue({ id: CUID_A });
    adjustCashbackMock.mockResolvedValue({
      id: "mov-1",
      customerId: CUID_A,
      amount: 10,
      type: "ADJUSTMENT",
    });

    const res = await POST(
      makePostRequest(CUID_A, validAdjustBody),
      { params: Promise.resolve({ customerId: CUID_A }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(adjustCashbackMock).toHaveBeenCalledOnce();
  });
});
