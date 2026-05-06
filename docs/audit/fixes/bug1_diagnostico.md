# Bug #1 — Diagnóstico

## Sintoma
`services/quote.service.ts:635-926` (`convertToSale`) cria venda incompleta. Vários side-effects que `sale.service.ts:create` aplica não são replicados.

## Análise lado-a-lado: `sale.create` × `quote.convertToSale`

| Side-effect | sale.create | quote.convertToSale | Veredito |
|---|---|---|---|
| `validateBranchOwnership(branchId, companyId)` | ✅ linha 196 | ❌ ausente | 🔴 |
| Validação de itens (ao menos 1) | ✅ linha 199 | ⚠️ parcial (não checa explicitamente) | 🟡 |
| Validação de pagamentos (ao menos 1) | ✅ linha 208 | ⚠️ via `validateQuotePayments` | 🟢 |
| Cálculo de subtotal/total no backend | ✅ linhas 217-232 (recalcula) | ❌ confia em `quote.subtotal/total` | 🟡 (gravado no quote, não recalcula) |
| Validação cashback ≤ total | ✅ linhas 235-261 | ❌ não suporta `cashbackUsed` na conversão | 🟡 (decisão de produto) |
| `validateStoreCredit` | ✅ linha 307 | ❌ ausente | 🔴 |
| `validateCreditLimit` | ✅ linha 310 (mesmo sendo stub) | ❌ ausente | 🔴 |
| Validação BALANCE_DUE exige customer | ✅ linhas 325-332 | ❌ ausente | 🔴 |
| Verificar caixa aberto | ✅ linhas 337-363 (auto-abre) | ✅ linha 693 (rejeita se não há) | 🟡 (comportamentos diferentes) |
| Buscar `CompanySettings` (juros/multa) | ✅ linha 366 | ❌ ausente | 🔴 (parcelas STORE_CREDIT geradas sem juros/multa default) |
| Status inicial Sale | `status: COMPLETED, completedAt: now` | `status: COMPLETED` (sem `completedAt`) | 🟡 |
| Buscar `Product.costPrice` e gravar em SaleItem | ✅ linhas 390-411 | ❌ não grava `costPrice` em SaleItem | 🔴 (relatórios de margem ficam zerados) |
| `atomicStockDebit` (race-safe + BranchStock) | ✅ linha 415 | ❌ usa `Product.update.decrement` direto | 🔴 |
| `StockMovement` (auditoria) | ✅ linha 425 | ❌ ausente | 🔴 |
| Auto-fee de cartão (CREDIT/DEBIT) | ✅ linhas 458-485 | ✅ linhas 796-824 | 🟢 |
| `CashMovement` filtrado por `METHODS_IN_CASH` | ✅ linha 490 | ❌ cria pra TODOS os métodos | 🔴 (CashMovement extra para CREDIT_CARD/STORE_CREDIT/BALANCE_DUE) |
| `AccountReceivable` (STORE_CREDIT, N parcelas) | ✅ linhas 514-540 | ❌ ausente | 🔴 |
| `AccountReceivable` (BALANCE_DUE, +30 dias) | ✅ linhas 545-562 | ❌ ausente | 🔴 |
| `CardReceivable` (CREDIT_CARD, N parcelas) | ✅ linhas 565-590 | ❌ ausente | 🔴 |
| Debitar cashback usado | ✅ linhas 594-625 | ❌ N/A (conversão não suporta cashbackUsed) | 🟡 |
| Criar `Commission` | ✅ linhas 628-652 | ✅ linhas 844-868 | 🟢 |
| `generateSaleEntries` (FinanceEntry / DRE) | ✅ linhas 654-661 (try/catch silencioso) | ✅ linhas 913-920 (idem) | 🟢 |
| `cashbackService.earnCashback` (ganho) | ✅ linhas 666-680 (fora da tx) | ❌ ausente | 🔴 |
| `processaSaleForCampaigns` | ✅ linhas 682-688 (fora da tx) | ❌ ausente | 🔴 |
| Lembrete pós-venda (`POST_SALE_30_DAYS`) | ✅ linhas 690-732 (fora da tx) | ❌ ausente | 🔴 |
| Atualizar `Quote.status = CONVERTED` + `convertedToSaleId` | N/A | ✅ linhas 870-888 | 🟢 |

### Resumo numérico
- **11 side-effects ausentes** (🔴) na conversão
- **3 validações ausentes** (validateBranchOwnership, validateStoreCredit, BALANCE_DUE customer check)
- **1 comportamento divergente** (CashMovement para todos os métodos em vez de apenas IN_CASH)
- **1 dado ausente** em SaleItem (`costPrice`)

## Impacto financeiro

Para uma venda convertida de orçamento com pagamento STORE_CREDIT R$ 300 em 3x:
- ❌ **Zero** parcelas em `AccountReceivable` → cliente "não deve" no sistema
- ❌ Mesmo assim, `CashMovement` foi criado (caixa registra entrada que não existe fisicamente)
- ❌ DRE chama `generateSaleEntries`, que pode gerar lançamento contábil **inconsistente** com a ausência de AR
- ❌ Estoque em BranchStock fica intacto (Product.stockQty drift)
- ❌ Cliente não acumulou cashback que deveria ter
- ❌ SaleItem.costPrice = 0 → relatório de margem mostra 100% lucro

Para CREDIT_CARD R$ 300 em 3x:
- ❌ Zero `CardReceivable` → previsão de fluxo de caixa errada
- ❌ CashMovement criado mesmo sendo método não-cash → caixa "infla"
- ❌ idem estoque drift, cashback, costPrice

## Diagnóstico read-only proposto

Script `scripts/diagnose-bug1-orphan-quotes.ts` listará:
1. Total de Sales com `convertedFromQuoteId NOT NULL`
2. Dessas, quantas:
   - Têm SalePayment com método STORE_CREDIT/BALANCE_DUE mas **zero** AccountReceivable
   - Têm SalePayment com método CREDIT_CARD mas **zero** CardReceivable
   - **Não têm StockMovement do tipo SALE** (ausência sugere conversão antiga)
   - Têm CashMovement com método CREDIT_CARD/STORE_CREDIT/BALANCE_DUE (excesso indevido)
3. Soma de `Sale.total` em vendas órfãs
4. Distribuição por mês (createdAt) e por empresa
5. Top 20 empresas com maior número de vendas órfãs

## Decisões já tomadas (Matheus)

1. **Cashback retroativo:** NÃO gerar para vendas convertidas antigas. A partir do fix, novas conversões geram cashback normalmente.
2. **costPrice retroativo:** ⚪ a decidir — provavelmente assumir 0 para vendas órfãs antigas (dívida técnica documentada). A correção do código grava costPrice corretamente daqui pra frente.
3. **Reverter CashMovement excedente:** ⚪ a decidir — script não vai apagar movimentos antigos (auditável demais), mas pode listar.
