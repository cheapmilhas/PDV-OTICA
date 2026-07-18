import { cookies } from "next/headers";

export type PlatformProduct = "VIS_APP" | "VIS_MEDICAL";

const VALID: PlatformProduct[] = ["VIS_APP", "VIS_MEDICAL"];
export const PRODUCT_COOKIE = "admin.product";

/** Normaliza um valor cru de cookie para um produto válido (default VIS_APP). */
export function parseProductContext(raw: string | undefined | null): PlatformProduct {
  return VALID.includes(raw as PlatformProduct) ? (raw as PlatformProduct) : "VIS_APP";
}

/** Lê o produto ativo do cookie do super admin (Server Component / route handler). */
export async function getProductContext(): Promise<PlatformProduct> {
  const store = await cookies();
  return parseProductContext(store.get(PRODUCT_COOKIE)?.value);
}

/**
 * Filtro Prisma por produto.
 * - Sem opts → filtra direto (`platformProduct`) — para `Company`.
 * - `{ via: "company" }` → via relação, para entidades com FK `companyId`/relação
 *   `company` mas sem o campo (ex.: `Subscription`).
 * - `{ via: "subscription.company" }` → dois níveis, para `Invoice`, que NÃO tem
 *   `companyId` nem relação `company` — só `subscriptionId` → `subscription.company`.
 */
export function productWhereFilter(
  product: PlatformProduct,
  opts?: { via: "company" | "subscription.company" },
): Record<string, unknown> {
  if (opts?.via === "company") {
    return { company: { platformProduct: product } };
  }
  if (opts?.via === "subscription.company") {
    return { subscription: { company: { platformProduct: product } } };
  }
  return { platformProduct: product };
}

/**
 * Filtro Prisma que ESCONDE empresas soft-deletadas (`blockedReason='DELETED'`,
 * a `delete` do admin marca a coluna, não apaga a linha). Espelha as 3 vias de
 * aninhamento do `productWhereFilter` para compor com ele.
 *
 * ⚠️ Inclui `blockedReason: null` explicitamente: em SQL `NULL != 'DELETED'` é
 * NULL (não true), então sem o ramo `null` a lista viria vazia (a maioria das
 * empresas tem `blockedReason` nulo).
 *
 * NÃO embutido no `productWhereFilter`: aquele promete só segmentação por
 * produto; um consumidor de auditoria/histórico pode precisar VER as excluídas.
 * Combine explicitamente por `AND` (não spread — a chave `company` colidiria):
 *   `{ AND: [productWhereFilter(p, o), notDeletedFilter(o)] }`
 */
export function notDeletedFilter(opts?: {
  via: "company" | "subscription.company";
}): Record<string, unknown> {
  const notDeleted = {
    OR: [{ blockedReason: null }, { blockedReason: { not: "DELETED" } }],
  };
  if (opts?.via === "company") {
    return { company: notDeleted };
  }
  if (opts?.via === "subscription.company") {
    return { subscription: { company: notDeleted } };
  }
  return notDeleted;
}
