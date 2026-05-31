/**
 * Helper para resolver preço de produto considerando override por filial.
 *
 * BranchStock pode ter costPrice/salePrice/promoPrice próprios.
 * Se preenchidos (não-null), sobrescrevem o valor global do Product.
 * Se null, usa o valor global do Product como fallback.
 */

/**
 * Aceita number, string, null/undefined ou Prisma.Decimal (que tem .toString()
 * e é convertível via Number()). Tipar como Decimal-estrutural evita acoplar
 * este helper ao @prisma/client.
 */
type PriceValue = number | string | { toString(): string } | null | undefined;

interface ProductWithPrices {
  costPrice?: PriceValue;
  salePrice?: PriceValue;
  promoPrice?: PriceValue;
}

interface BranchStockWithPrices {
  costPrice?: PriceValue;
  salePrice?: PriceValue;
  promoPrice?: PriceValue;
  marginPercent?: PriceValue;
}

export interface ResolvedPrice {
  costPrice: number;
  salePrice: number;
  promoPrice: number | null;
}

export function getProductPrice(
  product: ProductWithPrices,
  branchStock?: BranchStockWithPrices | null
): ResolvedPrice {
  return {
    costPrice:
      branchStock?.costPrice != null
        ? Number(branchStock.costPrice)
        : Number(product.costPrice ?? 0),
    salePrice:
      branchStock?.salePrice != null
        ? Number(branchStock.salePrice)
        : Number(product.salePrice ?? 0),
    promoPrice:
      branchStock?.promoPrice != null
        ? Number(branchStock.promoPrice)
        : product.promoPrice != null
          ? Number(product.promoPrice)
          : null,
  };
}
