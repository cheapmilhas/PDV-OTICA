import { productWhereFilter, type PlatformProduct } from "@/lib/admin-product-context";

/** Fragmentos de `where` para as queries do dashboard, segmentados por produto. */
export function buildDashboardFilters(product: PlatformProduct) {
  return {
    // Company: campo direto
    company: productWhereFilter(product),
    // Subscription: relação company (1 nível)
    subscriptionCompany: productWhereFilter(product, { via: "company" }),
    // Invoice: só tem subscriptionId → subscription.company (2 níveis)
    invoiceCompany: productWhereFilter(product, { via: "subscription.company" }),
  };
}
