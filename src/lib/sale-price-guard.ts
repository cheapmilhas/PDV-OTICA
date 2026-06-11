import { AppError, ERROR_CODES } from "@/lib/error-handler";
import { overrideAllows } from "@/lib/manager-override";
import type { ManagerOverrideDTO } from "@/lib/validations/sale.schema";

/**
 * Grupo D — anti-fraude de preço no servidor.
 *
 * O backend antes confiava 100% no `unitPrice`/`discount` enviados pelo
 * cliente. Um vendedor podia POSTar /api/sales com unitPrice 0,01 num produto
 * de R$2000, ou aplicar 99% de desconto (o modal de aprovação era só frontend).
 *
 * Esta validação:
 *  - PRICE_BELOW_COST: bloqueia (ou exige override) item com preço líquido
 *    abaixo do custo resolvido — venda no prejuízo precisa de gerente.
 *  - DISCOUNT_EXCEEDS_LIMIT: bloqueia (ou exige override) quando o desconto
 *    efetivo % (item + rateio do desconto da venda) excede o teto do papel
 *    do operador (sales.discount.max_<role>).
 *
 * Ambos reusam o fluxo de override de gerente já existente.
 */

export interface PriceGuardItem {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  /** desconto absoluto (R$) aplicado no item */
  itemDiscount: number;
  /** preço de referência resolvido (promoPrice ?? salePrice), por filial */
  referencePrice: number;
  /** custo resolvido (branchStock.costPrice ?? product.costPrice) */
  costPrice: number;
}

export interface PriceGuardInput {
  items: PriceGuardItem[];
  /** desconto aplicado no TOTAL da venda (R$), rateado proporcionalmente */
  saleDiscount: number;
  /** teto de desconto (%) permitido para o papel do operador */
  maxDiscountPercent: number;
  override?: ManagerOverrideDTO;
}

/**
 * Tolerância de centavos — evita falso positivo por arredondamento quando o
 * preço líquido bate exatamente no custo ou no teto.
 */
const EPSILON = 0.01;

export function assertSalePricing(input: PriceGuardInput): void {
  const { items, saleDiscount, maxDiscountPercent, override } = input;

  // Subtotal bruto (preço de venda enviado * qty, sem descontos) para ratear o
  // desconto do total proporcionalmente entre os itens.
  const grossSubtotal = items.reduce(
    (sum, it) => sum + it.unitPrice * it.qty,
    0
  );

  for (const it of items) {
    const lineGross = it.unitPrice * it.qty;

    // Rateio do desconto da venda proporcional ao peso do item no subtotal.
    const saleDiscountShare =
      grossSubtotal > 0 ? (saleDiscount * lineGross) / grossSubtotal : 0;

    const lineNet = lineGross - it.itemDiscount - saleDiscountShare;
    const unitNet = it.qty > 0 ? lineNet / it.qty : lineNet;

    // H4: a promoção cadastrada JÁ É a autorização. Se o preço líquido unitário
    // bate (dentro do EPSILON) com o preço de referência resolvido — ou seja, o
    // caixa cobrou exatamente o promoPrice/salePrice cadastrado, SEM desconto
    // extra — não exige override mesmo que a promo esteja abaixo do custo
    // (liquidação). Quem cadastrou a promoção já assumiu o prejuízo. Desconto
    // manual adicional abaixo do custo continua exigindo gerente.
    const cobrandoPrecoCadastrado =
      it.referencePrice > 0 && Math.abs(unitNet - it.referencePrice) < EPSILON;

    // PRICE_BELOW_COST: preço líquido unitário abaixo do custo.
    if (
      it.costPrice > 0 &&
      unitNet < it.costPrice - EPSILON &&
      !cobrandoPrecoCadastrado
    ) {
      if (!overrideAllows(override, "PRICE_BELOW_COST")) {
        throw new AppError(
          ERROR_CODES.PRICE_BELOW_COST,
          `"${it.productName}" sairia a R$ ${unitNet.toFixed(2)}, abaixo do custo (R$ ${it.costPrice.toFixed(2)}). Requer liberação.`,
          400
        );
      }
    }

    // DISCOUNT_EXCEEDS_LIMIT: desconto efetivo % vs preço de referência.
    // Só faz sentido se há referência > 0 e o líquido ficou abaixo dela.
    if (it.referencePrice > 0) {
      const refLine = it.referencePrice * it.qty;
      const discountPercent = ((refLine - lineNet) / refLine) * 100;
      if (
        discountPercent > maxDiscountPercent + EPSILON &&
        !overrideAllows(override, "DISCOUNT_EXCEEDS_LIMIT")
      ) {
        throw new AppError(
          ERROR_CODES.DISCOUNT_EXCEEDS_LIMIT,
          `Desconto de ${discountPercent.toFixed(1)}% em "${it.productName}" excede o limite de ${maxDiscountPercent}% do seu perfil. Requer liberação.`,
          400
        );
      }
    }
  }
}

/**
 * Mapeia o papel (UserRole) para a chave de regra sales.discount.max_<x>.
 * CAIXA/ATENDENTE caem no teto mais restritivo (seller).
 */
export function discountRuleKeyForRole(role: string | null | undefined): string {
  switch (role) {
    case "ADMIN":
      return "sales.discount.max_admin";
    case "GERENTE":
      return "sales.discount.max_manager";
    default:
      return "sales.discount.max_seller";
  }
}
