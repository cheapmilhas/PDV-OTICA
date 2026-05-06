# Bug #2 — Diagnóstico

## Sintoma

`app/api/sales/[id]/refund/route.ts:122-129` faz:

```ts
if (saleItem?.product?.stockControlled && saleItem.productId) {
  await tx.product.update({
    where: { id: saleItem.productId },
    data: { stockQty: { increment: ri.qtyReturned } },  // ⚠️ apenas Product.stockQty
  });
  // ... StockMovement criada com type CUSTOMER_RETURN ...
}
```

**Não atualiza `BranchStock`** (verdade por filial). Resultado:
- `Product.stockQty` (cache global) sobe corretamente após devolução
- `BranchStock.quantity` da filial onde a venda ocorreu **NÃO sobe**
- Com o tempo, `Product.stockQty != SUM(BranchStock.quantity por filial)` — drift

## Comparativo: refund × cancel

| Operação | Atualiza Product.stockQty | Atualiza BranchStock | StockMovement |
|---|---|---|---|
| `sale.create` | ✅ via `atomicStockDebit` | ✅ via `atomicStockDebit` | ✅ |
| `sale.cancel` (linhas 776-790) | ✅ direct increment | ✅ via `branchStock.upsert` | ✅ |
| `refund/route.ts` (linhas 122-129) | ✅ direct increment | ❌ **AUSENTE** | ✅ |

## Impacto

- Relatórios de estoque por filial (`/dashboard/relatorios/posicao-estoque`) ficam errados
- Quem confia em `BranchStock` (PDV ao validar estoque, transferências) acha que tem menos do que tem
- Próxima venda do mesmo produto na mesma filial pode falhar com "estoque insuficiente" (na verdade tem — só não foi recreditado)
- Próxima recebimento de mercadoria via `InventoryLot` ou `StockAdjustment` pode mascarar o drift

## Diagnóstico read-only proposto

Script `scripts/diagnose-bug2-stock-drift.ts`:

Para cada `Product` com `stockControlled=true`, calcular:
- `cache = Product.stockQty`
- `truth = SUM(BranchStock.quantity WHERE productId = Product.id)`
- `drift = cache - truth`

Listar produtos com `drift != 0`:
- Top 50 por `|drift|`
- Distribuição (drift > 0 / drift < 0 / == 0)
- Total de unidades em drift (soma absoluta)

Filtros para focar nos suspeitos:
- Produtos que aparecem em `Refund` (têm refund history)
- Produtos que aparecem em `Sale.convertedFromQuoteId NOT NULL` (afetados pelo Bug #1)

## Alternativas para correção do drift retroativo

### Estratégia (a) — Sincronizar `Product.stockQty = SUM(BranchStock)` ✅ ESCOLHIDA

**Justificativa (Matheus):** BranchStock é a verdade operacional (cada filial conta seu estoque físico). Product.stockQty é cache derivado.

**Risco:** se `Product.stockQty` representava algo correto e `BranchStock` que está errado, sobrescrever Product perde a referência. **Mitigação:** o script imprime o drift detalhado antes; Matheus revisa antes de aplicar.

**Não recria StockMovement faltantes** — risco de duplicar histórico.

### Estratégia (b) — Recriar StockMovements faltantes a partir de Refunds antigos
**Rejeitada.** Risco de duplicar registros de auditoria.

### Estratégia (c) — Ajuste manual case-a-case
**Rejeitada.** Inviável para volume grande.

## Decisões

1. **Correção do código:** refund passa a usar `atomicStockCredit` (que faz upsert no BranchStock + atualiza Product.stockQty atomicamente). Comportamento idêntico ao `sale.cancel`.
2. **Migração retroativa:** estratégia (a) — sincronizar `Product.stockQty = SUM(BranchStock.quantity)` por produto. Script idempotente, dry-run obrigatório.
3. **NÃO recriar StockMovement faltantes** — dívida técnica documentada. Rastros de auditoria de devoluções antigas ficam parciais (StockMovement já foi criado para CUSTOMER_RETURN no refund, só BranchStock que não foi atualizado).
