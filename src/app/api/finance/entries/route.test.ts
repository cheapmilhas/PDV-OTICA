import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Segurança Fase 2 (pentest 2026-06-27): POST /api/finance/entries é um
 * lançamento manual no ledger (debita FinanceAccount.balance, move a DRE).
 * Antes só exigia requireAuth → VENDEDOR/CAIXA podiam fabricar despesa.
 * Estes testes provam: exige finance.manage (403 sem) e rejeita amount<=0.
 */

const requireAuthMock = vi.fn();
const getCompanyIdMock = vi.fn();
const requirePermissionMock = vi.fn();
const getBranchIdMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  getBranchId: (...a: unknown[]) => getBranchIdMock(...a),
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

// withPlanFeatureGuard apenas encapsula o handler — no teste, passa direto.
vi.mock("@/lib/with-plan-feature", () => ({
  withPlanFeatureGuard: (h: (req: Request) => unknown) => h,
}));

const generateManualExpenseEntry = vi.fn();
vi.mock("@/services/finance-entry.service", () => ({
  generateManualExpenseEntry: (...a: unknown[]) => generateManualExpenseEntry(...a),
}));

const txMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => fn({}),
    financeEntry: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/validate-branch", () => ({ validateBranchOwnership: vi.fn() }));

import { POST } from "./route";
import { AppError } from "@/lib/error-handler";

function req(body: unknown) {
  return new Request("http://localhost/api/finance/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  description: "Despesa teste",
  amount: 100,
  debitAccountCode: "5.1",
  creditAccountCode: "1.1",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ user: { id: "u1" } });
  getCompanyIdMock.mockResolvedValue("c1");
  requirePermissionMock.mockResolvedValue(undefined);
  generateManualExpenseEntry.mockResolvedValue("entry-1");
});

describe("POST /api/finance/entries — guard de permissão", () => {
  it("exige a permissão financial.manage", async () => {
    await POST(req(validBody), {} as never);
    expect(requirePermissionMock).toHaveBeenCalledWith("financial.manage");
  });

  it("retorna 403 quando o usuário não tem finance.manage", async () => {
    requirePermissionMock.mockRejectedValue(
      new AppError("FORBIDDEN", "Sem permissão", 403)
    );
    const res = await POST(req(validBody), {} as never);
    expect(res.status).toBe(403);
    expect(generateManualExpenseEntry).not.toHaveBeenCalled();
  });

  it("rejeita amount <= 0 (não inverte saldo)", async () => {
    const res = await POST(req({ ...validBody, amount: -50 }), {} as never);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(generateManualExpenseEntry).not.toHaveBeenCalled();
  });

  it("cria o lançamento quando autorizado e válido", async () => {
    const res = await POST(req(validBody), {} as never);
    expect(res.status).toBeLessThan(400);
    expect(generateManualExpenseEntry).toHaveBeenCalled();
  });
});
