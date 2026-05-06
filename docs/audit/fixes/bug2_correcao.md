# Bug #2 — Correção do código

## Arquivo modificado
`src/app/api/sales/[id]/refund/route.ts`

## Mudança

Substituiu o restock manual (que só atualizava `Product.stockQty`) por chamada a `atomicStockCredit`, que:
- Faz `upsert` no `BranchStock` (cria se filial nunca teve esse produto)
- Atualiza `Product.stockQty` via `$executeRaw` UPDATE atômico
- Race-safe (usa SQL atômico, não Prisma decrement)

### Antes
```ts
if (saleItem?.product?.stockControlled && saleItem.productId) {
  await tx.product.update({
    where: { id: saleItem.productId },
    data: { stockQty: { increment: ri.qtyReturned } },
  });
  // ❌ NÃO TOCA BranchStock
  // ... StockMovement ...
}
```

### Depois
```ts
if (saleItem?.product?.stockControlled && saleItem.productId) {
  const creditResult = await atomicStockCredit(
    saleItem.productId,
    ri.qtyReturned,
    companyId,
    tx,
    sale.branchId
  );
  if (!creditResult.success) {
    throw businessRuleError(creditResult.error || "Falha ao restituir estoque na devolução");
  }
  // ... StockMovement ...
}
```

## Correção secundária — log estruturado de FinanceEntry

Mesma mudança de padrão do Bug #1: o `try/catch` silencioso do `generateRefundEntries` foi substituído por log estruturado JSON-line para Sentry/Vercel pickup.

## Compilação
`npx tsc --noEmit` rodado — **sem erros**.

## Riscos

- Risco de regressão: baixo (`atomicStockCredit` já é usado por outras rotas — `sale.cancel` indireto via lógica similar).
- Atomicidade preservada: a transação inteira reverte se algum credit falhar.

## Comportamento idêntico em: `sale.cancel`
`sale.cancel` faz `branchStock.upsert` + `Product.stockQty.increment` manualmente (linhas 776-790 de sale.service.ts). **Decisão:** NÃO refatorar `sale.cancel` neste fix — bug existe apenas em refund. Refatoração de cancel fica como follow-up.
