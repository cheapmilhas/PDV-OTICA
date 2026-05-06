# Bug #2 — Testes manuais

## Pré-requisitos
- Local com `npm run dev`
- Cliente C1, produto P1 com `BranchStock` controlado, caixa aberto

## TESTE 1: Refund total de venda single-item

1. Criar venda no PDV: 1× P1, R$ 100, CASH
2. Verificar BranchStock.quantity de P1 na filial: -1
3. Verificar Product.stockQty: -1
4. Ir em `/dashboard/vendas/[id]/detalhes`
5. Clicar "Devolver" → devolver 1 unidade

**Verificações:**
- ✅ `BranchStock.quantity` voltou ao valor original
- ✅ `Product.stockQty` voltou ao valor original
- ✅ `Refund` criado com `status=COMPLETED`
- ✅ `RefundItem` criado com `qtyReturned=1`
- ✅ `StockMovement` type=CUSTOMER_RETURN criado, quantity=+1
- ✅ Sale.status = REFUNDED (devolução total)

## TESTE 2: Refund parcial de venda multi-item

1. Criar venda: 3× P1 + 2× P2, total CASH
2. Devolver: 1× P1 + 0× P2

**Verificações:**
- ✅ `BranchStock` de P1 aumenta em 1, de P2 inalterado
- ✅ `Product.stockQty` de P1 aumenta em 1
- ✅ Sale.status = COMPLETED (não REFUNDED — devolução parcial)
- ✅ 1 RefundItem para P1 com `qtyReturned=1`

## TESTE 3: Refund de produto sem BranchStock prévio

Caso edge: produto está no Product mas a filial nunca recebeu (sem `BranchStock` registro).

1. Setup: produto X com `Product.stockQty=10` mas sem `BranchStock` nessa filial específica (testar caso raro)
2. Vender 1 unidade (pode falhar a venda — verificar)
3. Caso conseguir vender, fazer refund

**Verificações:**
- `atomicStockCredit` faz upsert no `BranchStock` — cria se não existe
- ✅ Após refund, `BranchStock` da filial existe com `quantity=1`

## TESTE 4: Verificação de drift

```sql
SELECT
  p.id, p.sku, p."stockQty" as cache,
  COALESCE(SUM(bs.quantity), 0) as truth,
  p."stockQty" - COALESCE(SUM(bs.quantity), 0) as drift
FROM "Product" p
LEFT JOIN branch_stocks bs ON bs.product_id = p.id
WHERE p."stockControlled" = true
GROUP BY p.id, p.sku, p."stockQty"
HAVING p."stockQty" != COALESCE(SUM(bs.quantity), 0);
```

Em ambiente local pós-fix, esperado: 0 linhas (sem drift novo).

## TESTE 5: Erro silencioso → log estruturado

Difícil reproduzir naturalmente. Confirmar manualmente:
- Antes: `console.error("[FINANCE] Erro ao gerar lançamentos de devolução:", err)` → opaco
- Depois: `console.error(JSON.stringify({level:"error", event:"refund_finance_entries_generation_failed", refundId, ...}))`

## REGRESSÃO: cancel de venda continua funcionando

`sale.cancel` não foi alterada — só refund. Mas executar cancelamento de venda como controle:

1. Criar venda
2. Cancelar venda
3. Verificar BranchStock e Product.stockQty repostos

**Verificações:**
- ✅ Comportamento de cancel idêntico ao antes do fix

## CHECKLIST FINAL

- [ ] TESTE 1-5 passam em dev
- [ ] `npx tsc --noEmit` sem erro
- [ ] Diff revisado por Matheus
- [ ] Após deploy: rodar `diagnose-bug2-stock-drift.ts` em produção para baseline
- [ ] Aguardar uma semana de operação com fix novo antes de rodar `fix-bug2-stock-drift.ts`
  - Razão: validar que refunds NOVOS estão atualizando BranchStock corretamente
  - Depois rodar fix retroativo para corrigir drift acumulado
