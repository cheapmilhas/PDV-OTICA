/**
 * Utilitário padronizado para cálculos de estoque.
 * Usar em TODAS as telas que mostram estoque baixo/zerado.
 */

/** Estoque mínimo padrão quando o produto não tem stockMin definido */
const DEFAULT_MIN_STOCK = 5;

/**
 * Verifica se produto tem estoque baixo (acima de 0 mas abaixo do mínimo).
 */
export function isLowStock(currentStock: number, minimumStock?: number | null): boolean {
  const threshold = minimumStock && minimumStock > 0 ? minimumStock : DEFAULT_MIN_STOCK;
  return currentStock > 0 && currentStock <= threshold;
}

/**
 * Verifica se produto está sem estoque.
 */
export function isOutOfStock(currentStock: number): boolean {
  return currentStock <= 0;
}

/**
 * SQL WHERE clause para estoque baixo (padronizado).
 * Inclui produtos com stockMin definido OU usa default.
 *
 * Usar em raw queries:
 * - stockControlled = true
 * - active = true
 * - (stockMin > 0 AND stockQty <= stockMin) OR (stockMin = 0 AND stockQty <= DEFAULT_MIN_STOCK AND stockQty > 0)
 */
export const LOW_STOCK_SQL_CONDITION = `
  "stockControlled" = true
  AND "active" = true
  AND (
    ("stockMin" > 0 AND "stockQty" <= "stockMin")
    OR ("stockMin" = 0 AND "stockQty" <= ${DEFAULT_MIN_STOCK} AND "stockQty" > 0)
  )
`;

export { DEFAULT_MIN_STOCK };
