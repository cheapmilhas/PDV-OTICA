/**
 * FASE 2 (TEC-06 + BUG-02) — fonte única de cálculo de totais de venda/orçamento.
 *
 * Antes a fórmula estava duplicada em sale.service, quote.service, os schemas e
 * nas telas (PDV, orçamentos), com divergências (cashback misturado no total em
 * um lugar, arredondamento inconsistente). Este módulo centraliza, usa decimal.js
 * (evita erro de ponto flutuante) e é importável no client e no server.
 *
 * PARIDADE: a semântica é idêntica à fórmula atual —
 *   subtotal           = Σ (qty * unitPrice - itemDiscount)
 *   descontoEfetivo    = percent > 0 ? subtotal * percent/100 : descontoFixo
 *   total              = subtotal - descontoEfetivo
 *   totalAfterCashback = total - cashbackUsed
 * A diferença é só o motor (Decimal em vez de float). Resultados arredondados a
 * 2 casas (centavos). Ver sale-totals.test.ts para a prova de paridade.
 */
import Decimal from "decimal.js";

export interface TotalsItem {
  qty: number;
  unitPrice: number;
  /** desconto absoluto (R$) no item */
  discount?: number;
}

export interface TotalsInput {
  items: TotalsItem[];
  /** desconto fixo (R$) no total da venda */
  discount?: number;
  /** desconto percentual no total (se > 0, tem precedência sobre o fixo) */
  discountPercent?: number;
  /** cashback usado (R$) — abate só no totalAfterCashback, não no total */
  cashbackUsed?: number;
}

export interface TotalsResult {
  subtotal: number;
  /** desconto efetivo em R$ (resolvido de percent ou fixo) */
  discount: number;
  total: number;
  cashbackUsed: number;
  totalAfterCashback: number;
}

/** Arredonda a 2 casas (centavos), meio-para-cima — padrão monetário. */
function round2(d: Decimal): number {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/** Total líquido de um item: qty * unitPrice - discount. */
export function itemLineTotal(item: TotalsItem): number {
  const gross = new Decimal(item.qty).times(item.unitPrice);
  const net = gross.minus(item.discount ?? 0);
  return round2(net);
}

/**
 * Calcula todos os totais de uma venda/orçamento. Fonte única.
 */
export function calculateTotals(input: TotalsInput): TotalsResult {
  const { items, discount = 0, discountPercent = 0, cashbackUsed = 0 } = input;

  // subtotal = Σ (qty * unitPrice - itemDiscount)
  let subtotalD = new Decimal(0);
  for (const it of items) {
    const gross = new Decimal(it.qty).times(it.unitPrice);
    const net = gross.minus(it.discount ?? 0);
    subtotalD = subtotalD.plus(net);
  }

  // desconto efetivo: percentual tem precedência sobre fixo (igual quote atual)
  const discountD =
    discountPercent > 0
      ? subtotalD.times(discountPercent).dividedBy(100)
      : new Decimal(discount);

  const totalD = subtotalD.minus(discountD);
  const cashbackD = new Decimal(cashbackUsed);
  const totalAfterCashbackD = totalD.minus(cashbackD);

  return {
    subtotal: round2(subtotalD),
    discount: round2(discountD),
    total: round2(totalD),
    cashbackUsed: round2(cashbackD),
    totalAfterCashback: round2(totalAfterCashbackD),
  };
}
