import { describe, it, expect } from "vitest";
import {
  assertSalePricing,
  discountRuleKeyForRole,
  type PriceGuardItem,
} from "./sale-price-guard";

function item(overrides: Partial<PriceGuardItem> = {}): PriceGuardItem {
  return {
    productId: "p1",
    productName: "Óculos X",
    qty: 1,
    unitPrice: 100,
    itemDiscount: 0,
    referencePrice: 100,
    costPrice: 50,
    ...overrides,
  };
}

describe("assertSalePricing", () => {
  it("permite venda no preço de referência sem desconto", () => {
    expect(() =>
      assertSalePricing({
        items: [item()],
        saleDiscount: 0,
        maxDiscountPercent: 10,
      })
    ).not.toThrow();
  });

  it("permite desconto dentro do teto do papel", () => {
    expect(() =>
      assertSalePricing({
        items: [item({ unitPrice: 100, itemDiscount: 10 })], // 10% desconto
        saleDiscount: 0,
        maxDiscountPercent: 10,
      })
    ).not.toThrow();
  });

  it("bloqueia desconto acima do teto (DISCOUNT_EXCEEDS_LIMIT)", () => {
    expect(() =>
      assertSalePricing({
        items: [item({ unitPrice: 100, itemDiscount: 20 })], // 20% > 10%
        saleDiscount: 0,
        maxDiscountPercent: 10,
      })
    ).toThrowError(/excede o limite de 10%/);
  });

  it("bloqueia preço abaixo do custo (PRICE_BELOW_COST)", () => {
    expect(() =>
      assertSalePricing({
        items: [item({ unitPrice: 0.01, referencePrice: 100, costPrice: 50 })],
        saleDiscount: 0,
        maxDiscountPercent: 100, // teto não bloqueia; o custo sim
      })
    ).toThrowError(/abaixo do custo/);
  });

  it("override PRICE_BELOW_COST libera venda no prejuízo", () => {
    expect(() =>
      assertSalePricing({
        items: [item({ unitPrice: 40, referencePrice: 100, costPrice: 50 })],
        saleDiscount: 0,
        maxDiscountPercent: 100,
        override: { approvedByUserId: "u1", reasons: ["PRICE_BELOW_COST"] },
      })
    ).not.toThrow();
  });

  it("override DISCOUNT_EXCEEDS_LIMIT libera desconto alto (acima do custo)", () => {
    expect(() =>
      assertSalePricing({
        items: [item({ unitPrice: 100, itemDiscount: 40, costPrice: 30 })],
        saleDiscount: 0,
        maxDiscountPercent: 10,
        override: { approvedByUserId: "u1", reasons: ["DISCOUNT_EXCEEDS_LIMIT"] },
      })
    ).not.toThrow();
  });

  it("rateia o desconto da venda no item ao calcular o %", () => {
    // 2 itens de R$100 (subtotal 200), desconto de venda R$30 → 15% efetivo
    expect(() =>
      assertSalePricing({
        items: [
          item({ productId: "a", unitPrice: 100, referencePrice: 100, costPrice: 10 }),
          item({ productId: "b", unitPrice: 100, referencePrice: 100, costPrice: 10 }),
        ],
        saleDiscount: 30,
        maxDiscountPercent: 10,
      })
    ).toThrowError(/excede o limite de 10%/);
  });

  it("não usa custo quando costPrice é 0 (produto sem custo cadastrado)", () => {
    expect(() =>
      assertSalePricing({
        items: [item({ unitPrice: 1, referencePrice: 0, costPrice: 0 })],
        saleDiscount: 0,
        maxDiscountPercent: 10,
      })
    ).not.toThrow();
  });

  it("usa preço de referência promocional sem acusar desconto", () => {
    // refPrice já é o promo (80); vender a 80 = 0% desconto
    expect(() =>
      assertSalePricing({
        items: [item({ unitPrice: 80, referencePrice: 80, costPrice: 50 })],
        saleDiscount: 0,
        maxDiscountPercent: 10,
      })
    ).not.toThrow();
  });

  it("H4: promoção ABAIXO do custo cobrada exatamente não exige override (liquidação)", () => {
    // promoPrice cadastrado = 40, custo = 50 → abaixo do custo, mas o caixa
    // cobrou exatamente o promo (referencePrice 40). Quem cadastrou autorizou.
    expect(() =>
      assertSalePricing({
        items: [item({ unitPrice: 40, referencePrice: 40, costPrice: 50 })],
        saleDiscount: 0,
        maxDiscountPercent: 100,
      })
    ).not.toThrow();
  });

  it("H4: desconto manual EXTRA abaixo do promo (e do custo) ainda exige override", () => {
    // promo 40 (refPrice), custo 50, mas o caixa deu mais R$5 de desconto →
    // líquido 35 != referencePrice 40 → não é "preço cadastrado" → bloqueia.
    expect(() =>
      assertSalePricing({
        items: [item({ unitPrice: 40, itemDiscount: 5, referencePrice: 40, costPrice: 50 })],
        saleDiscount: 0,
        maxDiscountPercent: 100,
      })
    ).toThrowError(/abaixo do custo/);
  });
});

describe("discountRuleKeyForRole", () => {
  it("mapeia papéis para as chaves de regra", () => {
    expect(discountRuleKeyForRole("ADMIN")).toBe("sales.discount.max_admin");
    expect(discountRuleKeyForRole("GERENTE")).toBe("sales.discount.max_manager");
    expect(discountRuleKeyForRole("VENDEDOR")).toBe("sales.discount.max_seller");
  });

  it("CAIXA/ATENDENTE/desconhecido caem no teto mais restritivo (seller)", () => {
    expect(discountRuleKeyForRole("CAIXA")).toBe("sales.discount.max_seller");
    expect(discountRuleKeyForRole("ATENDENTE")).toBe("sales.discount.max_seller");
    expect(discountRuleKeyForRole(null)).toBe("sales.discount.max_seller");
    expect(discountRuleKeyForRole(undefined)).toBe("sales.discount.max_seller");
  });
});
