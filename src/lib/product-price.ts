/**
 * Helper para resolver preço de produto considerando override por filial.
 *
 * BranchStock pode ter costPrice/salePrice/promoPrice próprios.
 * Se preenchidos (não-null), sobrescrevem o valor global do Product.
 * Se null, usa o valor global do Product como fallback.
 */

interface ProductWithPrices {
  costPrice?: number | string | null;
  salePrice?: number | string | null;
  promoPrice?: number | string | null;
}

interface BranchStockWithPrices {
  costPrice?: number | string | null;
  salePrice?: number | string | null;
  promoPrice?: number | string | null;
  marginPercent?: number | string | null;
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
