# Bug #1 — Correção do código

## Arquivos

| Arquivo | Tipo | Linhas |
|---|---|---|
| `src/services/sale-side-effects.service.ts` | **NOVO** | ~430 LOC |
| `src/services/sale.service.ts` | refatorado (apenas `create`) | redução de ~280 LOC para ~85 LOC na função |
| `src/services/quote.service.ts` | refatorado (apenas `convertToSale`) | comportamento aumentado, paridade com `sale.create` |

## Compilação

`npx tsc --noEmit` rodado após cada mudança incremental — **sem erros**.

## Resumo das mudanças

### `src/services/sale-side-effects.service.ts` (novo)

Helpers compartilhados usados por `sale.service.create` e `quote.service.convertToSale`. Funções:

| Função | Quando | Faz |
|---|---|---|
| `applyStockDebitInTx(tx, params)` | dentro tx | `atomicStockDebit` (race-safe BranchStock+Product.stockQty) + `StockMovement` (type SALE) |
| `applyPaymentsInTx(tx, params)` | dentro tx | Cria `SalePayment`, auto-fee de cartão (CREDIT/DEBIT), `CashMovement` (apenas `METHODS_IN_CASH`), `AccountReceivable` (STORE_CREDIT N parcelas), `AccountReceivable` (BALANCE_DUE 1 parcela +30d), `CardReceivable` (CREDIT_CARD N parcelas) |
| `applyCashbackUsageInTx(tx, params)` | dentro tx | Decrementa `CustomerCashback.balance`, incrementa `totalUsed`, cria `CashbackMovement` DEBIT |
| `applyCommissionInTx(tx, params)` | dentro tx | Calcula percent (`User.defaultCommissionPercent` ou 5%) e cria `Commission` |
| `applyFinanceEntriesInTx(tx, params)` | dentro tx | Chama `generateSaleEntries` com try/catch + log estruturado |
| `applyPostCommitSideEffects(params)` | depois do commit | Cashback ganho + campanhas + lembrete `POST_SALE_30_DAYS`. Aceita `skipCashbackEarn` (usado pelo script de migração) |

### `src/services/sale.service.ts:create` (refatorado)

**Comportamento idêntico ao anterior**, mas usando os helpers. Permite que `convertToSale` reuse o mesmo código.

Diff conceitual:
- Antes: 280+ linhas inline
- Depois: ~85 linhas que criam Sale + SaleItems e chamam helpers
- Removidos imports não mais usados: `calculateInstallments`, `dateOnlyToUTC`, `addDays`, `cashbackService`
- Mantidos imports: `validateCreditLimit`, `validateStoreCredit`, `validateBranchOwnership`, `atomicStockDebit` (usado em `cancel`), `processaSaleForCampaigns` (usado em `reactivate`), `METHODS_IN_CASH` (usado em `cancel`)

### `src/services/quote.service.ts:convertToSale` (refatorado — comportamento corrigido)

**Comportamento expandido para paridade com `sale.create`.** Adicionou:

| Side-effect | Antes | Depois |
|---|---|---|
| `validateBranchOwnership` | ❌ | ✅ |
| `validateStoreCredit` | ❌ | ✅ |
| `validateCreditLimit` | ❌ | ✅ (mesmo sendo stub — Bug #3 resolve) |
| `BALANCE_DUE` exige customer | ❌ | ✅ |
| `Sale.completedAt` setado | ❌ | ✅ |
| `Quote.convertedAt`/`convertedByUserId` setado | ❌ | ✅ |
| `SaleItem.costPrice` gravado | ❌ (era 0) | ✅ (busca `Product.costPrice`) |
| `atomicStockDebit` (BranchStock + Product.stockQty + StockMovement) | ❌ (só Product.stockQty) | ✅ |
| `CashMovement` filtrado por `METHODS_IN_CASH` | ❌ (criava pra todos) | ✅ |
| `AccountReceivable` (STORE_CREDIT) | ❌ | ✅ |
| `AccountReceivable` (BALANCE_DUE) | ❌ | ✅ |
| `CardReceivable` (CREDIT_CARD) | ❌ | ✅ |
| `Commission` | ✅ | ✅ (preservado, agora via helper) |
| `FinanceEntry` (DRE) | ✅ (try/catch silencioso) | ✅ (try/catch com log estruturado) |
| `cashbackService.earnCashback` (pós-commit) | ❌ | ✅ |
| `processaSaleForCampaigns` (pós-commit) | ❌ | ✅ |
| Lembrete pós-venda `POST_SALE_30_DAYS` (pós-commit) | ❌ | ✅ |

### Tratamento de erros

Mudança de padrão: `try/catch` silencioso (`// NÃO throw — secundário`) substituído por log estruturado JSON-line:

```ts
console.error(JSON.stringify({
  level: "error",
  event: "finance_entries_generation_failed",
  saleId,
  companyId,
  error: ...,
  stack: ...,
}));
```

Mesmo comportamento (não bloqueia), mas auditável em Vercel logs / Sentry futuro.

## Decisões importantes

### 1. Auto-abertura de caixa
`sale.create` auto-abre caixa se não houver. `quote.convertToSale` rejeita explicitamente.

**Decisão:** mantido o comportamento atual da conversão (rejeitar). Operador deve abrir o caixa antes. Mais previsível.

### 2. `cashbackUsed` em conversão
`sale.create` aceita `cashbackUsed`. `convertToSale` não tem esse parâmetro.

**Decisão:** não adicionar agora. Escopo do Bug #1 é restaurar paridade dos side-effects existentes. Funcionalidade de "usar cashback ao converter orçamento" fica como follow-up.

### 3. Helper aceita `skipCashbackEarn`
`applyPostCommitSideEffects` aceita flag para script de migração não dar cashback retroativo (decisão de Matheus). Conversões NOVAS passam `skipCashbackEarn: false`.

## Riscos conhecidos

### Risco 1 — Regressão em `sale.create`
`sale.create` foi refatorado para usar os mesmos helpers. Comportamento deve ser idêntico, mas precisa validação manual.

**Mitigação:** os testes manuais em `bug1_testes.md` cobrem PDV direto também (não só conversão).

### Risco 2 — Dados sintéticos (custo zero) em vendas convertidas antigas
Vendas convertidas antes deste fix têm `SaleItem.costPrice = 0`. **A correção do código não corrige retroativamente.** O script de migração também não corrige (decisão — risco de errar mais).

**Mitigação documentada:** relatórios de margem para vendas antigas convertidas mostrarão margem 100% (lucro = preço). Documentar como dívida técnica aceita.

### Risco 3 — `validateCreditLimit` ainda é stub no Bug #1
Quando `convertToSale` chamar `validateCreditLimit`, ele retorna `{approved: true}` sempre (até o Bug #3 ser corrigido). Não causa bug — apenas mantém comportamento permissivo atual.

**Mitigação:** Bug #3 resolve isso na mesma fase.

## Dependências

Nenhuma migration Prisma necessária para Bug #1. Apenas mudança de código.
