import { describe, it, expect } from "vitest";
import { getProductPrice } from "./product-price";

describe("getProductPrice", () => {
  describe("sem branchStock", () => {
    it("usa preços do produto global", () => {
      const r = getProductPrice({ costPrice: 50, salePrice: 100, promoPrice: 80 });
      expect(r).toEqual({ costPrice: 50, salePrice: 100, promoPrice: 80 });
    });

    it("trata promoPrice null", () => {
      const r = getProductPrice({ costPrice: 50, salePrice: 100, promoPrice: null });
      expect(r.promoPrice).toBeNull();
    });

    it("trata costPrice/salePrice null como zero", () => {
      const r = getProductPrice({ costPrice: null, salePrice: null });
      expect(r.costPrice).toBe(0);
      expect(r.salePrice).toBe(0);
    });

    it("converte strings para number (Prisma Decimal)", () => {
      const r = getProductPrice({ costPrice: "12.50", salePrice: "25.00" });
      expect(r.costPrice).toBe(12.5);
      expect(r.salePrice).toBe(25);
    });
  });

  describe("com branchStock", () => {
    it("branchStock vazio cai pro produto", () => {
      const r = getProductPrice(
        { costPrice: 50, salePrice: 100, promoPrice: 80 },
        {},
      );
      expect(r).toEqual({ costPrice: 50, salePrice: 100, promoPrice: 80 });
    });

    it("branchStock sobrescreve todos os preços quando preenchidos", () => {
      const r = getProductPrice(
        { costPrice: 50, salePrice: 100, promoPrice: 80 },
        { costPrice: 45, salePrice: 95, promoPrice: 75 },
      );
      expect(r).toEqual({ costPrice: 45, salePrice: 95, promoPrice: 75 });
    });

    it("override parcial: só salePrice", () => {
      const r = getProductPrice(
        { costPrice: 50, salePrice: 100, promoPrice: 80 },
        { salePrice: 90 },
      );
      expect(r).toEqual({ costPrice: 50, salePrice: 90, promoPrice: 80 });
    });

    it("override parcial: só costPrice", () => {
      const r = getProductPrice(
        { costPrice: 50, salePrice: 100 },
        { costPrice: 30 },
      );
      expect(r.costPrice).toBe(30);
      expect(r.salePrice).toBe(100);
    });

    it("branchStock null em campo individual cai pro produto", () => {
      const r = getProductPrice(
        { costPrice: 50, salePrice: 100, promoPrice: 80 },
        { costPrice: null, salePrice: 90, promoPrice: null },
      );
      expect(r).toEqual({ costPrice: 50, salePrice: 90, promoPrice: 80 });
    });

    it("branchStock pode zerar promoPrice se for null", () => {
      const r = getProductPrice(
        { costPrice: 50, salePrice: 100, promoPrice: null },
        { promoPrice: null },
      );
      expect(r.promoPrice).toBeNull();
    });

    it("aceita Decimal-like strings em branchStock", () => {
      const r = getProductPrice(
        { costPrice: 50, salePrice: 100 },
        { costPrice: "33.33", salePrice: "66.66" },
      );
      expect(r.costPrice).toBe(33.33);
      expect(r.salePrice).toBe(66.66);
    });
  });

  describe("edge cases", () => {
    it("produto totalmente vazio retorna zeros", () => {
      const r = getProductPrice({});
      expect(r).toEqual({ costPrice: 0, salePrice: 0, promoPrice: null });
    });

    it("branchStock=null se comporta como undefined", () => {
      const r = getProductPrice({ costPrice: 10, salePrice: 20 }, null);
      expect(r).toEqual({ costPrice: 10, salePrice: 20, promoPrice: null });
    });

    it("branchStock.promoPrice=0 é um valor válido (não null)", () => {
      const r = getProductPrice(
        { costPrice: 50, salePrice: 100, promoPrice: 80 },
        { promoPrice: 0 },
      );
      expect(r.promoPrice).toBe(0);
    });
  });
});
