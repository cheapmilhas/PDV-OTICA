import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cross-tenant isolation tests for POST /api/inventory/lots
 * Pentest 2026-06-28: provar que um usuário da empresa A não pode creditar
 * um lote num produto da empresa B (IDOR via productId).
 */

// --- auth-helpers mock ---
const requireAuthMock = vi.fn();
const getCompanyIdMock = vi.fn();
const getUserIdMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  getUserId: (...a: unknown[]) => getUserIdMock(...a),
}));

// --- plan-features passthrough ---
vi.mock("@/lib/plan-features", () => ({
  requirePlanFeature: vi.fn().mockResolvedValue(undefined),
}));

// --- validate-branch passthrough ---
vi.mock("@/lib/validate-branch", () => ({
  validateBranchOwnership: vi.fn().mockResolvedValue(undefined),
}));

// --- stock service passthrough ---
vi.mock("@/services/stock.service", () => ({
  atomicStockCredit: vi.fn().mockResolvedValue(undefined),
}));

// --- prisma mock ---
const productFindFirstMock = vi.fn();
const txInventoryLotCreateMock = vi.fn();
const txProductUpdateMock = vi.fn();
const txStockMovementCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findFirst: (...a: unknown[]) => productFindFirstMock(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}));

import type { NextRequest } from "next/server";
import { POST } from "./route";

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/inventory/lots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/inventory/lots — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: "u1", companyId: "company-A" } });
    getCompanyIdMock.mockResolvedValue("company-A");
    getUserIdMock.mockResolvedValue("u1");

    // Simula a transação executando o callback
    transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        inventoryLot: { create: txInventoryLotCreateMock },
        product: { update: txProductUpdateMock },
        stockMovement: { create: txStockMovementCreateMock },
      };
      return cb(tx);
    });

    txInventoryLotCreateMock.mockResolvedValue({ id: "lot-1", productId: "prod-A" });
    txProductUpdateMock.mockResolvedValue({});
    txStockMovementCreateMock.mockResolvedValue({});
  });

  it("404 quando productId pertence a outra empresa (cross-tenant barrado)", async () => {
    // Produto da empresa B — findFirst com { id: productId, companyId: 'company-A' } retorna null
    productFindFirstMock.mockResolvedValue(null);

    const res = await POST(
      makePostRequest({ productId: "prod-B", qtyIn: 10, unitCost: 50 })
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/não encontrado/i);

    // Nenhuma escrita deve ter ocorrido
    expect(txProductUpdateMock).not.toHaveBeenCalled();
    expect(txInventoryLotCreateMock).not.toHaveBeenCalled();
    expect(txStockMovementCreateMock).not.toHaveBeenCalled();
  });

  it("201 quando productId pertence à mesma empresa (mesmo tenant aceito)", async () => {
    productFindFirstMock.mockResolvedValue({ id: "prod-A", companyId: "company-A" });

    const res = await POST(
      makePostRequest({ productId: "prod-A", qtyIn: 10, unitCost: 50 })
    );

    expect(res.status).toBe(201);
    // A transação deve ter sido executada e product.update chamado
    expect(txProductUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prod-A" } })
    );
    expect(txInventoryLotCreateMock).toHaveBeenCalledOnce();
  });
});
