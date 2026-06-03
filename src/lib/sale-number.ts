/**
 * Número de exibição de uma venda.
 *
 *   Venda numerada:  #000123  (Sale.number sequencial por empresa)
 *   Fallback:        #PSJHMXYZ (últimos 8 chars do cuid, maiúsculo) — para
 *                    vendas legadas que ainda não têm `number`.
 *
 * Espelha `os-number.ts` (versão simples, sem derivações). O `number` interno
 * é único por empresa (constraint do banco); aqui é só a exibição.
 */

export interface SaleNumberInput {
  id: string;
  number?: number | null;
}

function pad(n: number): string {
  return String(n).padStart(6, "0");
}

export function saleDisplayNumber(sale: SaleNumberInput): string {
  return sale.number && sale.number > 0
    ? `#${pad(sale.number)}`
    : `#${sale.id.slice(-8).toUpperCase()}`;
}
