import { parseProductContext, type PlatformProduct } from "@/lib/admin-product-context";

export interface ProvisionProductDecision {
  platformProduct: PlatformProduct;
  /** Finance setup de ótica (plano de contas etc.) só faz sentido no Vis App. */
  runOpticalFinanceSetup: boolean;
}

export function resolveProvisionProduct(raw: string | undefined | null): ProvisionProductDecision {
  const platformProduct = parseProductContext(raw);
  return {
    platformProduct,
    runOpticalFinanceSetup: platformProduct === "VIS_APP",
  };
}
