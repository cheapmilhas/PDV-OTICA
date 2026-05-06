# Bug #1 — Testes manuais

> Roteiro para validar a correção em ambiente local (desenvolvimento) antes de deploy.

## Pré-requisitos

- Branch local com as mudanças aplicadas
- `npm run dev` rodando
- Login com role ADMIN ou GERENTE (precisa permissão `quotes.convert`)
- Pelo menos 1 cliente cadastrado
- Pelo menos 2 produtos com estoque (1 com `BranchStock` da filial atual)
- Caixa aberto na filial

## Smoke test inicial

### 0. Compilação
```bash
npx tsc --noEmit
```
Deve passar sem erro.

### 0.1. Lint
```bash
npm run lint
```
Não pode introduzir novos warnings.

---

## TESTE 1: Conversão Quote → Sale com CASH puro

1. Login no sistema
2. `/dashboard/orcamentos/novo`
3. Adicionar produto P1 (R$ 100, 1 unidade)
4. Selecionar cliente C1
5. Salvar orçamento → status PENDING
6. Aprovar orçamento → status APPROVED
7. Clicar "Converter em venda"
8. Forma de pagamento: **Dinheiro R$ 100**
9. Confirmar conversão

**Verificações:**
- ✅ Sale criada com `status=COMPLETED, completedAt setado`
- ✅ Quote.status = CONVERTED, convertedToSaleId, convertedAt setado
- ✅ `BranchStock` da filial diminuiu em 1 unidade (verificar em `/dashboard/estoque`)
- ✅ `Product.stockQty` diminuiu em 1 unidade
- ✅ `StockMovement` criada (type=SALE, quantity=-1)
- ✅ `CashMovement` criada (method=CASH, direction=IN, amount=100)
- ✅ `Commission` criada para o vendedor (status=PENDING)
- ✅ `FinanceEntry` gerado (verificar em `/dashboard/relatorios/dre`)
- ✅ Cashback ganho — verificar `CustomerCashback.balance` aumentou (se config ativo)
- ✅ Lembrete `POST_SALE_30_DAYS` criado (verificar em CRM)
- ✅ NÃO criou `AccountReceivable` (CASH não gera)
- ✅ NÃO criou `CardReceivable` (CASH não gera)

---

## TESTE 2: Conversão com PIX

Igual TESTE 1 mas pagamento PIX. Deve gerar CashMovement (PIX está em `METHODS_IN_CASH`).

---

## TESTE 3: Conversão com DEBIT_CARD

Igual TESTE 1 com DEBIT_CARD R$ 100.

**Verificações adicionais:**
- ✅ `SalePayment.feePercent`, `feeAmount`, `netAmount`, `settlementDate` preenchidos (auto-fee)
- ✅ `CashMovement` criado (DEBIT_CARD está em `METHODS_IN_CASH`)
- ✅ NÃO criou `CardReceivable` (apenas CREDIT_CARD cria)

---

## TESTE 4: Conversão com CREDIT_CARD 1x

Pagamento CREDIT_CARD R$ 100, 1x.

**Verificações:**
- ✅ `SalePayment` criada com fee preenchido
- ❌ NÃO criou `CashMovement` (CREDIT_CARD NÃO está em `METHODS_IN_CASH`)
- ✅ Criou 1 `CardReceivable` com `expectedDate ≈ hoje + 30 dias`

---

## TESTE 5: Conversão com CREDIT_CARD 3x

Pagamento CREDIT_CARD R$ 300, 3x.

**Verificações:**
- ✅ Criou 3 `CardReceivable`:
  - parcela 1, +30 dias
  - parcela 2, +60 dias
  - parcela 3, +90 dias
- ✅ Soma dos `grossAmount` = 300 (com possível diferença em centavos na última)

---

## TESTE 6: Conversão com STORE_CREDIT 3x

Pagamento STORE_CREDIT R$ 300, 3 parcelas, primeira em data X.

**Verificações:**
- ✅ Criou 3 `AccountReceivable`:
  - parcela 1, dueDate = X
  - parcela 2, dueDate = X + 30
  - parcela 3, dueDate = X + 60
- ✅ Soma dos `amount` = 300 exato (última recebe ajuste de centavos)
- ✅ `finePercent`, `interestPercent`, `graceDays` preenchidos com `CompanySettings` defaults
- ❌ NÃO criou `CashMovement` (STORE_CREDIT NÃO está em `METHODS_IN_CASH`)
- ❌ NÃO criou `CardReceivable`

---

## TESTE 7: Conversão com BALANCE_DUE

Pagamento BALANCE_DUE R$ 200.

**Verificações:**
- ✅ Criou 1 `AccountReceivable` com `dueDate = hoje + 30 dias`
- ✅ `description` contém "Saldo a Receber - Pagamento na entrega"
- ❌ NÃO criou `CashMovement`
- ❌ NÃO criou `CardReceivable`

---

## TESTE 8: Conversão com mix (STORE_CREDIT + CREDIT_CARD + CASH)

Total R$ 500:
- CASH R$ 100
- CREDIT_CARD R$ 200, 2x
- STORE_CREDIT R$ 200, 2 parcelas

**Verificações:**
- ✅ 3 `SalePayment` criadas
- ✅ 1 `CashMovement` (apenas CASH)
- ✅ 2 `CardReceivable` (CREDIT_CARD)
- ✅ 2 `AccountReceivable` (STORE_CREDIT)

---

## TESTE 9: Erro ao converter sem caixa aberto

1. Fechar o caixa
2. Tentar converter um orçamento APPROVED

**Verificações:**
- ❌ Erro 400: "Não há caixa aberto. Abra o caixa antes de converter o orçamento em venda."
- ✅ Quote permanece em status APPROVED
- ✅ Nenhuma Sale criada

---

## TESTE 10: Erro ao converter Quote não-APPROVED

1. Criar Quote em DRAFT
2. Tentar converter

**Verificações:**
- ❌ Erro 400: "Orçamento deve estar APROVADO para conversão"

---

## TESTE 11: Erro ao tentar dupla conversão concorrente

1. Aprovar um Quote
2. Em duas abas separadas, clicar "Converter" rapidamente

**Verificações:**
- ✅ Apenas 1 Sale é criada
- ✅ Segunda chamada falha (constraint `Quote.convertedToSaleId @unique` viola)
- ✅ Quote.status = CONVERTED

---

## TESTE 12: Erro ao converter com BALANCE_DUE sem cliente

1. Criar Quote sem `customerId` (usar customer snapshot)
2. Aprovar
3. Tentar converter com BALANCE_DUE

**Verificações:**
- ❌ Erro 400: "Saldo a Receber exige um cliente vinculado"

---

## TESTE 13: Sale.completedAt e Quote.convertedAt

Após qualquer conversão bem-sucedida:
- ✅ `Sale.completedAt` preenchido com timestamp da conversão
- ✅ `Quote.convertedAt` preenchido
- ✅ `Quote.convertedByUserId` preenchido com o user que converteu

---

## TESTE 14: SaleItem.costPrice preenchido

1. Produto com `costPrice = 50` no cadastro
2. Criar Quote com esse produto e converter
3. Verificar `SaleItem`:

```sql
SELECT id, "saleId", "productId", "unitPrice", "costPrice", "lineTotal"
FROM "SaleItem"
WHERE "saleId" = '<sale_id>';
```

**Verificações:**
- ✅ `costPrice = 50` (não zero!)

---

## REGRESSÃO: Sale direto via PDV (caminho não-orçamento)

### TESTE 15: PDV direto com CASH
1. `/dashboard/pdv`
2. Adicionar produto, cliente, finalizar com CASH

**Verificações:**
- ✅ Comportamento idêntico ao antes da refatoração (caminho `sale.create`)
- ✅ Todas as side-effects acontecem normalmente

### TESTE 16: PDV direto com STORE_CREDIT 3x
1. PDV com pagamento crediário 3 parcelas

**Verificações:**
- ✅ 3 `AccountReceivable` criadas
- ✅ `finePercent`, `interestPercent`, `graceDays` preenchidos
- ✅ Comportamento idêntico

### TESTE 17: Cancelar venda criada via conversão
1. Converter um Quote → Sale
2. Cancelar a Sale (`/dashboard/vendas/[id]/detalhes` → cancelar)

**Verificações:**
- ✅ Sale.status = CANCELED
- ✅ BranchStock e Product.stockQty repostos
- ✅ AccountReceivable das parcelas → status CANCELED
- ✅ CardReceivable deletadas
- ✅ Commission → CANCELED
- ✅ FinanceEntry deletadas

---

## VALIDAÇÃO DO LOG ESTRUTURADO

Um dos pontos é trocar o `try/catch` silencioso por log estruturado.

### TESTE 18: Forçar erro em FinanceEntry e ver log
Difícil reproduzir naturalmente. Validar manualmente:
- Em produção, se houver erro na geração de `FinanceEntry`, deve aparecer no `console.error` do Vercel um JSON-line:
  ```
  {"level":"error","event":"finance_entries_generation_failed","saleId":"...","companyId":"...","error":"..."}
  ```
- Antes era `[FINANCE] Erro ao gerar lançamentos: <stack>` — opaco para Sentry

---

## CHECKLIST FINAL

- [ ] Todos os testes 1-18 passaram em local/dev
- [ ] `npx tsc --noEmit` sem erro
- [ ] `npm run lint` sem novos warnings
- [ ] Verificar que **nenhum** comportamento de `sale.create` direto regrediu
- [ ] Diff do código revisado pelo Matheus
- [ ] Após deploy: rodar `diagnose-bug1-orphan-quotes.ts` em produção para baseline
