import { describe, it, expect } from "vitest";
import { calculateTotals, itemLineTotal, type TotalsItem } from "./sale-totals";

/**
 * FASE 2 — Prova de PARIDADE do helper único vs. a fórmula float atual.
 *
 * A fórmula antiga (sale.service.ts:300-346) em float puro:
 *   subtotal = Σ (qty*unitPrice - itemDiscount)
 *   total    = subtotal - discount
 *   totalAfterCashback = total - cashbackUsed
 * Para orçamento, desconto pode ser percentual: subtotal * pct/100.
 *
 * Estes testes recriam a fórmula antiga e comparam com o helper numa bateria de
 * casos reais de ótica. Tolerância: 0 centavos (devem bater exatamente após
 * arredondamento a 2 casas).
 */

// Réplica EXATA da fórmula float antiga (sem decimal.js), para comparação.
function legacyTotals(
  items: TotalsItem[],
  discount = 0,
  discountPercent = 0,
  cashbackUsed = 0
) {
  const subtotal = items.reduce(
    (s, it) => s + (it.qty * it.unitPrice - (it.discount ?? 0)),
    0
  );
  const eff = discountPercent > 0 ? subtotal * (discountPercent / 100) : discount;
  const total = subtotal - eff;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(eff * 100) / 100,
    total: Math.round(total * 100) / 100,
    totalAfterCashback: Math.round((total - cashbackUsed) * 100) / 100,
  };
}

// Bateria de casos reais de ótica.
const CASES: Array<{
  name: string;
  items: TotalsItem[];
  discount?: number;
  discountPercent?: number;
  cashbackUsed?: number;
}> = [
  { name: "armação + lente simples", items: [{ qty: 1, unitPrice: 399 }, { qty: 1, unitPrice: 899 }] },
  { name: "desconto fixo no total", items: [{ qty: 1, unitPrice: 699 }], discount: 68.64 },
  { name: "desconto por item", items: [{ qty: 1, unitPrice: 399, discount: 122.33 }] },
  { name: "percentual no orçamento", items: [{ qty: 1, unitPrice: 1299 }, { qty: 1, unitPrice: 399 }], discountPercent: 15 },
  { name: "cashback usado", items: [{ qty: 1, unitPrice: 499 }], cashbackUsed: 50 },
  { name: "qty múltipla", items: [{ qty: 3, unitPrice: 199.9 }] },
  { name: "centavos quebrados", items: [{ qty: 7, unitPrice: 14.29, discount: 0.03 }] },
  { name: "combinação completa", items: [{ qty: 2, unitPrice: 399, discount: 10 }, { qty: 1, unitPrice: 1299 }], discount: 100, cashbackUsed: 25.5 },
  { name: "percentual com centavos", items: [{ qty: 1, unitPrice: 333.33 }], discountPercent: 33 },
  { name: "valores pequenos", items: [{ qty: 1, unitPrice: 0.1 }, { qty: 1, unitPrice: 0.2 }] },
  { name: "valor grande", items: [{ qty: 10, unitPrice: 1299 }], discount: 500 },
  { name: "zero", items: [{ qty: 1, unitPrice: 0 }] },
];

describe("sale-totals: paridade com a fórmula atual (0 centavos de diferença)", () => {
  for (const c of CASES) {
    it(`paridade: ${c.name}`, () => {
      const novo = calculateTotals({
        items: c.items,
        discount: c.discount,
        discountPercent: c.discountPercent,
        cashbackUsed: c.cashbackUsed,
      });
      const antigo = legacyTotals(c.items, c.discount, c.discountPercent, c.cashbackUsed);

      expect(novo.subtotal).toBe(antigo.subtotal);
      expect(novo.discount).toBe(antigo.discount);
      expect(novo.total).toBe(antigo.total);
      expect(novo.totalAfterCashback).toBe(antigo.totalAfterCashback);
    });
  }
});

describe("sale-totals: comportamento", () => {
  it("itemLineTotal: qty*unitPrice - discount", () => {
    expect(itemLineTotal({ qty: 2, unitPrice: 100, discount: 30 })).toBe(170);
  });

  it("percentual tem precedência sobre fixo", () => {
    const r = calculateTotals({ items: [{ qty: 1, unitPrice: 100 }], discount: 5, discountPercent: 10 });
    expect(r.discount).toBe(10); // 10% de 100, ignora o fixo de 5
    expect(r.total).toBe(90);
  });

  it("cashback abate só no totalAfterCashback, não no total", () => {
    const r = calculateTotals({ items: [{ qty: 1, unitPrice: 100 }], cashbackUsed: 30 });
    expect(r.total).toBe(100);
    expect(r.totalAfterCashback).toBe(70);
  });

  it("decimal.js evita erro de float (0.1+0.2)", () => {
    const r = calculateTotals({ items: [{ qty: 1, unitPrice: 0.1 }, { qty: 1, unitPrice: 0.2 }] });
    expect(r.subtotal).toBe(0.3); // float puro daria 0.30000000000000004 antes de arredondar
  });
});
