import { describe, it, expect, vi, beforeEach } from "vitest";
import { ERROR_CODES } from "@/lib/error-handler";

// Mock do stock.service para controlar o resultado do débito atômico.
vi.mock("@/services/stock.service", () => ({
  atomicStockDebit: vi.fn(),
}));

import { atomicStockDebit } from "@/services/stock.service";
import { applyStockDebitInTx } from "@/services/sale-side-effects.service";

/**
 * Regressão do item 5 (venda falha mas erro só aparece no console):
 * quando o débito atômico de estoque falha, applyStockDebitInTx deve lançar
 * um AppError com code INSUFFICIENT_STOCK — assim o PDV reconhece o erro,
 * mostra "📦 Estoque insuficiente" e oferece autorização do gerente. Antes
 * lançava VALIDATION_ERROR genérico e o usuário só via o erro no console.
 */
describe("applyStockDebitInTx — código de erro de estoque", () => {
  const mockTx: any = {
    stockMovement: { create: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lança INSUFFICIENT_STOCK quando o débito falha", async () => {
    (atomicStockDebit as any).mockResolvedValue({
      success: false,
      previousQty: 0,
      newQty: 0,
      error: 'Estoque insuficiente para "Armação X". Disponível: 0, Solicitado: 1',
    });

    await expect(
      applyStockDebitInTx(mockTx, {
        sale: { id: "sale_1", branchId: "branch_1", companyId: "company_1" },
        items: [{ productId: "prod_1", qty: 1 }],
        userId: "user_1",
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.INSUFFICIENT_STOCK });
  });

  it("preserva a mensagem de erro vinda do stock service", async () => {
    const msg = 'Estoque insuficiente para "Lente Y". Disponível: 2, Solicitado: 5';
    (atomicStockDebit as any).mockResolvedValue({
      success: false,
      previousQty: 2,
      newQty: 2,
      error: msg,
    });

    await expect(
      applyStockDebitInTx(mockTx, {
        sale: { id: "sale_2", branchId: "branch_1", companyId: "company_1" },
        items: [{ productId: "prod_2", qty: 5 }],
        userId: "user_1",
      })
    ).rejects.toThrow(msg);
  });

  it("registra StockMovement quando o débito tem sucesso", async () => {
    (atomicStockDebit as any).mockResolvedValue({
      success: true,
      previousQty: 10,
      newQty: 9,
    });

    await applyStockDebitInTx(mockTx, {
      sale: { id: "sale_3", branchId: "branch_1", companyId: "company_1" },
      items: [{ productId: "prod_3", qty: 1 }],
      userId: "user_1",
    });

    expect(mockTx.stockMovement.create).toHaveBeenCalledOnce();
  });
});
