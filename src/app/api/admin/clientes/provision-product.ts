import type { PlatformProduct } from "@/lib/admin-product-context";

const VALID_PRODUCTS: PlatformProduct[] = ["VIS_APP", "VIS_MEDICAL"];

export interface ProvisionProductDecision {
  platformProduct: PlatformProduct;
  /** Finance setup de ótica (plano de contas etc.) só faz sentido no Vis App. */
  runOpticalFinanceSetup: boolean;
}

/**
 * Decide o produto de uma NOVA conta a partir do valor cru do body.
 *
 * Diferente de `parseProductContext` (que tolera lixo num cookie legado e cai em
 * VIS_APP), aqui distinguimos:
 *  - ausente (undefined/null/"") → default VIS_APP (compat. com o provisionador de ótica).
 *  - presente e VÁLIDO → usa o valor.
 *  - presente e INVÁLIDO → `null` → o caller deve responder 400 (nunca classificar
 *    silenciosamente uma conta no produto errado).
 */
export function resolveProvisionProduct(
  raw: string | undefined | null,
): ProvisionProductDecision | null {
  let platformProduct: PlatformProduct;
  if (raw === undefined || raw === null || raw === "") {
    platformProduct = "VIS_APP";
  } else if (VALID_PRODUCTS.includes(raw as PlatformProduct)) {
    platformProduct = raw as PlatformProduct;
  } else {
    return null; // presente e inválido → erro, não default silencioso
  }
  return {
    platformProduct,
    runOpticalFinanceSetup: platformProduct === "VIS_APP",
  };
}
