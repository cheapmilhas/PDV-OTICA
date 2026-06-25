import type { Prisma, SaleStatus } from "@prisma/client";

/**
 * FONTE ÚNICA: quais status de venda contam como RECEITA REALIZADA num DRE.
 *
 * Contexto (bug C1 — Bloco 3): existem dois DREs no sistema.
 *
 *   1. DRE DINÂMICO (ledger) — `getDynamicDRE` em finance-report.service.ts.
 *      Lê de FinanceEntry. Está CORRETO: só vendas COMPLETED geram
 *      `SALE_REVENUE` no ledger (generateSaleEntries roda na finalização da
 *      venda), e devoluções geram entradas `REFUND/DEBIT` + `COGS/CREDIT` que
 *      estornam receita e custo (inclusive devolução parcial, proporcional aos
 *      itens devolvidos). Logo o ledger enxerga, na prática, apenas vendas
 *      COMPLETED e já desconta devoluções.
 *
 *   2. DRE GERENCIAL (Sales) — `DREService` em reports/dre.service.ts. Lê
 *      direto de `Sale`/`SaleItem`. Filtrava `status != CANCELED`, o que
 *      DEIXAVA PASSAR vendas REFUNDED (devolvidas) — contando-as como receita
 *      bruta + CMV. Resultado: lucro INFLADO em todo mês com devolução. Esse é
 *      o relatório que o dono usa para decidir, então as decisões saíam sobre
 *      número inflado.
 *
 * Para os dois NUNCA MAIS divergirem, o critério de "venda que conta como
 * receita realizada" mora aqui e é reusado pelo DRE gerencial. O critério
 * espelha o que o ledger já faz de fato: somente `COMPLETED`.
 *
 * Por que COMPLETED (e não apenas "não CANCELED nem REFUNDED"):
 *   - REFUNDED  → devolvida: não é receita realizada (bug C1).
 *   - CANCELED  → cancelada: nunca foi receita.
 *   - OPEN      → venda estacionada/rascunho ainda não finalizada: não gera
 *                 ledger nem é receita fechada. Mesmo padrão já adotado no CRM
 *                 (H16, crm.service.ts) para não inflar totalSpent.
 *   - COMPLETED → única que vira `SALE_REVENUE` no ledger.
 *
 * Devolução parcial: no ledger é tratada de forma proporcional (estorno só dos
 * itens devolvidos). Numa venda parcialmente devolvida o `Sale.status`
 * permanece COMPLETED — então ela CONTINUA contando como receita aqui, e o
 * abatimento da parte devolvida vem das entradas de REFUND do ledger (DRE
 * dinâmico). O DRE gerencial, por ler `Sale.total` cheio, não conhece o
 * estorno parcial; isso é uma limitação conhecida da fonte Sales e está
 * documentada — o DRE dinâmico é a fonte fiel para devolução parcial.
 */

/** Único status de venda que representa receita realizada num DRE. */
export const REALIZED_REVENUE_SALE_STATUS: SaleStatus = "COMPLETED";

/**
 * Filtro Prisma reusável para `Sale.status` em relatórios de receita/lucro.
 * Use em `where` de qualquer consulta de DRE baseada em vendas.
 */
export const realizedRevenueSaleStatusFilter: Prisma.SaleWhereInput["status"] =
  REALIZED_REVENUE_SALE_STATUS;
