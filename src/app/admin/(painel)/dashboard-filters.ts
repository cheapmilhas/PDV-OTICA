import {
  notDeletedFilter,
  productWhereFilter,
  type PlatformProduct,
} from "@/lib/admin-product-context";

/**
 * Fragmentos de `where` para as queries do dashboard, segmentados por produto E
 * escondendo empresas soft-deletadas (`blockedReason='DELETED'`) — mesmo critério
 * da lista de clientes. Sem o soft-delete, a casca de teste entrava nas contagens
 * (total de empresas, novas no mês, saúde) enquanto sumia da lista.
 *
 * Merge por `AND` (não spread): produto e soft-delete aninham na MESMA chave
 * `company`/`subscription.company` nas vias de relação, então o spread perderia
 * um dos dois. O `AND` percorre cada operando pela relação separadamente.
 */
export function buildDashboardFilters(product: PlatformProduct) {
  return {
    // Company: campo direto
    company: {
      AND: [productWhereFilter(product), notDeletedFilter()],
    },
    // Subscription: relação company (1 nível)
    subscriptionCompany: {
      AND: [
        productWhereFilter(product, { via: "company" }),
        notDeletedFilter({ via: "company" }),
      ],
    },
    // Invoice: só tem subscriptionId → subscription.company (2 níveis)
    invoiceCompany: {
      AND: [
        productWhereFilter(product, { via: "subscription.company" }),
        notDeletedFilter({ via: "subscription.company" }),
      ],
    },
  };
}
