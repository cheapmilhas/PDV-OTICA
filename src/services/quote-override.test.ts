import { describe, it, expect, vi, beforeEach } from "vitest";
import { ERROR_CODES } from "@/lib/error-handler";
import { overrideAllows } from "@/lib/manager-override";
import type { ManagerOverrideDTO } from "@/lib/validations/sale.schema";

// Mock do stock.service para controlar o resultado do débito atômico.
// O mock honra `allowNegative` (6º arg posicional de atomicStockDebit): quando
// ligado, o débito tem sucesso mesmo com estoque insuficiente — espelhando o
// comportamento real do atomicStockDebit (UPDATE sem WHERE quantity >= qty).
vi.mock("@/services/stock.service", () => ({
  atomicStockDebit: vi.fn(),
}));

import { atomicStockDebit } from "@/services/stock.service";
import { applyStockDebitInTx } from "@/services/sale-side-effects.service";

const mockTx: any = {
  stockMovement: { create: vi.fn() },
};

/**
 * A5 — Furo na conversão de orçamento: a chamada de applyStockDebitInTx em
 * quote.service.convertToSale NÃO passava `allowNegative`, então o override do
 * gerente (reasons: ["INSUFFICIENT_STOCK"]) era ignorado e o gerente não
 * conseguia autorizar a venda se o estoque mudou entre o PDV e a conversão.
 *
 * Estes testes provam a REGRA que o furo viola: overrideAllows converte o
 * override em allowNegative=true, e applyStockDebitInTx com allowNegative=true
 * permite o débito negativo (não lança INSUFFICIENT_STOCK).
 */
describe("A5 — override do gerente habilita venda sem estoque na conversão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Comportamento real espelhado: allowNegative=true → sucesso mesmo sem estoque.
    (atomicStockDebit as any).mockImplementation(
      (
        _productId: string,
        _qty: number,
        _companyId: string,
        _tx: unknown,
        _branchId: string,
        allowNegative?: boolean
      ) =>
        allowNegative
          ? Promise.resolve({ success: true, previousQty: 0, newQty: -_qty })
          : Promise.resolve({
              success: false,
              previousQty: 0,
              newQty: 0,
              error: "Estoque insuficiente",
            })
    );
  });

  it("overrideAllows converte override INSUFFICIENT_STOCK em true (e undefined em false)", () => {
    const override: ManagerOverrideDTO = {
      approvedByUserId: "mgr_1",
      reasons: ["INSUFFICIENT_STOCK"],
    };
    expect(overrideAllows(override, "INSUFFICIENT_STOCK")).toBe(true);
    expect(overrideAllows(undefined, "INSUFFICIENT_STOCK")).toBe(false);
  });

  it("applyStockDebitInTx com allowNegative=true NÃO lança quando estoque insuficiente", async () => {
    const override: ManagerOverrideDTO = {
      approvedByUserId: "mgr_1",
      reasons: ["INSUFFICIENT_STOCK"],
    };

    await expect(
      applyStockDebitInTx(mockTx, {
        sale: { id: "s1", branchId: "b1", companyId: "co1" },
        items: [{ productId: "p1", qty: 5 }],
        userId: "u1",
        allowNegative: overrideAllows(override, "INSUFFICIENT_STOCK"),
      })
    ).resolves.not.toThrow();

    expect(atomicStockDebit).toHaveBeenCalledWith(
      "p1",
      5,
      "co1",
      mockTx,
      "b1",
      true
    );
    expect(mockTx.stockMovement.create).toHaveBeenCalledOnce();
  });

  it("sem override (allowNegative=false) LANÇA INSUFFICIENT_STOCK — o furo da conversão", async () => {
    await expect(
      applyStockDebitInTx(mockTx, {
        sale: { id: "s2", branchId: "b1", companyId: "co1" },
        items: [{ productId: "p2", qty: 5 }],
        userId: "u1",
        allowNegative: overrideAllows(undefined, "INSUFFICIENT_STOCK"),
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.INSUFFICIENT_STOCK });
  });
});
