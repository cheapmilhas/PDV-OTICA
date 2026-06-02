import { describe, it, expect } from "vitest";
import { StockMovementType } from "@prisma/client";
import { resolveStockOperation, shouldRestockOnCancel } from "./stock-operation";

describe("resolveStockOperation — decisão de movimentação de estoque", () => {
  describe("ADJUSTMENT (inventário físico)", () => {
    it("aplica valor absoluto para produto controlado", () => {
      expect(
        resolveStockOperation({ type: StockMovementType.ADJUSTMENT, stockControlled: true })
      ).toBe("set-absolute");
    });
    it("aplica valor absoluto MESMO para produto não-controlado", () => {
      expect(
        resolveStockOperation({ type: StockMovementType.ADJUSTMENT, stockControlled: false })
      ).toBe("set-absolute");
    });
  });

  describe("Entrada de estoque (T9 — credita sempre)", () => {
    it("PURCHASE credita produto controlado", () => {
      expect(
        resolveStockOperation({ type: StockMovementType.PURCHASE, stockControlled: true })
      ).toBe("credit");
    });
    it("PURCHASE credita produto NÃO-controlado (bug T9: antes ignorava → some do PDV)", () => {
      expect(
        resolveStockOperation({ type: StockMovementType.PURCHASE, stockControlled: false })
      ).toBe("credit");
    });
    it("CUSTOMER_RETURN e TRANSFER_IN também creditam não-controlado", () => {
      expect(
        resolveStockOperation({ type: StockMovementType.CUSTOMER_RETURN, stockControlled: false })
      ).toBe("credit");
      expect(
        resolveStockOperation({ type: StockMovementType.TRANSFER_IN, stockControlled: false })
      ).toBe("credit");
    });
  });

  describe("Saída de estoque (assimetria — só debita controlado)", () => {
    it("SALE debita produto controlado", () => {
      expect(
        resolveStockOperation({ type: StockMovementType.SALE, stockControlled: true })
      ).toBe("debit");
    });
    it("SALE NÃO debita produto não-controlado (assimetria intencional)", () => {
      expect(
        resolveStockOperation({ type: StockMovementType.SALE, stockControlled: false })
      ).toBe("none");
    });
    it("LOSS / SUPPLIER_RETURN / INTERNAL_USE / TRANSFER_OUT só debitam controlado", () => {
      for (const type of [
        StockMovementType.LOSS,
        StockMovementType.SUPPLIER_RETURN,
        StockMovementType.INTERNAL_USE,
        StockMovementType.TRANSFER_OUT,
      ]) {
        expect(resolveStockOperation({ type, stockControlled: true })).toBe("debit");
        expect(resolveStockOperation({ type, stockControlled: false })).toBe("none");
      }
    });
  });
});

describe("shouldRestockOnCancel — estorno de estoque no cancelamento (T7)", () => {
  it("RE-estoca produto controlado (a venda havia debitado)", () => {
    expect(shouldRestockOnCancel(true)).toBe(true);
  });
  it("NÃO re-estoca produto não-controlado (bug T7: saldo subia 34→35)", () => {
    expect(shouldRestockOnCancel(false)).toBe(false);
  });
});
