# 08 — Fluxo Financeiro e Caixa

## 1. Caixa (`CashShift` + `CashMovement`)

### 1.1 Abertura
**API:** `POST /api/cash/shift` → `cashService.openShift()` (`cash.service.ts:22-81`)
**Rate limit:** 10 aberturas/min/user
**Permissão:** `cash_shift.open`

**Validação (linha 30-43):**
- `findFirst` por `[branchId, status: OPEN]` antes da transação. Se existir, lança erro.

**🔴 Race condition:** check + create **fora da transação**. Dois POSTs simultâneos podem criar 2 turnos OPEN. **Schema não tem partial unique index** para impedir.

**Transação (linha 46-78):**
1. Cria `CashShift` com `status: OPEN`, `openedByUserId`, `openingFloatAmount`
2. Se `openingFloatAmount > 0`: cria `CashMovement` (OPENING_FLOAT, IN, CASH)

### 1.2 Fechamento
**API:** `POST /api/cash/shift/close` → `cashService.closeShift()` (`cash.service.ts:90-157`)
**Permissão:** `cash_shift.close`

**Cálculo:**
1. Filtra movimentos `method === "CASH"` apenas (linha 115)
2. `closingExpectedCash = sum(IN.amount) - sum(OUT.amount)`
3. `differenceCash = closingDeclaredCash - closingExpectedCash`
4. Se `Math.abs(differenceCash) > 0.01` e sem `differenceJustification` → 400 (linha 128)

**Update:**
5. `CashShift.update` { status: CLOSED, closedByUserId, closedAt, closingDeclaredCash, closingExpectedCash, differenceCash, differenceJustification, notes }

**🟠 Não usa transação** (a operação é só um update — OK, mas o cálculo lê os movimentos sem snapshot consistente; se um movimento for criado entre o read e o update, a diferença fica errada).

### 1.3 Sangria/Suprimento
**API:** `POST /api/cash/movements` → `cashService.createMovement()` (linha 167-211)

- Exige caixa aberto
- `SUPPLY` → direction IN
- `WITHDRAWAL` → direction OUT
- `originType: "MANUAL"`, `originId: openShift.id`

### 1.4 Tipos de movimento (`CashMovementType`)
```
SALE_PAYMENT     - Pagamento de venda
REFUND           - Estorno de venda
SUPPLY           - Suprimento (entrada manual)
WITHDRAWAL       - Sangria (saída manual)
ADJUSTMENT       - Ajuste manual
OPENING_FLOAT    - Fundo de troco
CLOSING          - Fechamento (não vi uso)
```

### 1.5 Métodos in-cash vs não-cash
`METHODS_IN_CASH` (constante em `lib/payment-methods.ts` ⚪ não lido) provavelmente: `[CASH, PIX, DEBIT_CARD]`. Apenas estes geram `CashMovement` durante venda. CREDIT_CARD vai para `CardReceivable`. STORE_CREDIT/BALANCE_DUE vão para `AccountReceivable`.

## 2. Métodos de pagamento (10 valores no enum)

```
CASH         - Dinheiro
PIX          - PIX (recebido na hora)
DEBIT_CARD   - Cartão débito
CREDIT_CARD  - Cartão crédito (parcelado, vai pra CardReceivable)
BOLETO       - Boleto bancário
STORE_CREDIT - Crediário (parcelado em AccountReceivable)
CHEQUE       - Cheque
AGREEMENT    - Convênio
OTHER        - Outro
BALANCE_DUE  - Saldo a Receber (1 parcela, vence em 30 dias na entrega)
```

### 2.1 STORE_CREDIT (crediário)
**Em `sale.create`:** linhas 514-540 (rel. 07).
- Recebe `installmentConfig: { count, firstDueDate, interval }` no payment
- Chama `calculateInstallments(amount, count, firstDueDate, interval)` (de `lib/installment-utils.ts`)
- Cria N `AccountReceivable` com:
  - `amount` = parcela
  - `dueDate` = data calculada
  - `installmentNumber`/`totalInstallments`
  - `finePercent` = `companySettings.defaultFinePercent ?? 2`
  - `interestPercent` = `companySettings.defaultInterestPercent ?? 1`
  - `graceDays` = `companySettings.defaultGraceDays ?? 0`
- ⚪ **NÃO há check de limite de crédito**? Há sim — `validateCreditLimit` chamado antes da transação (linha 309-320 do sale.service)

### 2.2 BALANCE_DUE (saldo a receber)
**Em `sale.create`:** linhas 545-562.
- Cliente obrigatório (validado linha 325-332)
- Cria 1 `AccountReceivable` com `dueDate = now + 30 dias`
- Sem juros/multa pré-configurados
- Conceito: cliente paga **na entrega do produto/OS**

### 2.3 CREDIT_CARD
**Em `sale.create`:** linhas 565-590.
- Cria N `CardReceivable` (N = parcelas)
- `expectedDate = now + 30*i dias` (para cada parcela i)
- `grossAmount = amount / N`
- `salePaymentId` FK
- `status` String default "PENDING"
- ⚪ Sem cálculo de fee aplicado ao CardReceivable (fee é do SalePayment)

### 2.4 Page `/dashboard/financeiro/cartoes`
Existe (`(dashboard)/dashboard/financeiro/cartoes/page.tsx` — `permission="financial.view"`). Provavelmente lista CardReceivables, permite baixar settlement. ⚪ não auditada em detalhe.

### 2.5 `CardFeeRule` (taxa de cartão)
Schema linhas 71-87. `@@unique([companyId, brand, paymentType, installments])`. `feePercent` Decimal(5,4), `feeFixed` Decimal(10,2), `settlementDays` Int.

`calculateCardFee(companyId, brand, type, installments, amount)` — chamada em `sale.service.ts:464` e em `quote.convertToSale:803`. Falha → silenciosa.

### 2.6 `RecurringExpense` ("Gerar Contas do Mês")

**API:** `POST /api/recurring-expenses/generate` (`/api/recurring-expenses/generate/route.ts`)

**Mecânica:**
1. Lista `RecurringExpense` com `companyId` e `active: true`
2. Para cada expense:
   - **Idempotência check:** `findFirst` em `AccountPayable` com `[companyId, recurringExpenseId, dueDate >= mês_inicio AND <= mês_fim]`
   - Se já existe → `skipped++`
   - Senão → cria `AccountPayable` + atualiza `RecurringExpense.lastGeneratedAt` e `nextDueDate`

**🔴 Race condition:**
- Check (`findFirst`) + create **fora da transação**
- Duas chamadas simultâneas podem ambas passar pelo check e criar duplicatas
- **Schema não tem `@@unique([recurringExpenseId, year, month])`** para impedir

**🟡 Lógica de mês:**
- `dueDate = new Date(year, month, exp.dayOfMonth)` — usa fuso local do servidor (provavelmente UTC) — pode pular dia em SP
- Sem timezone São Paulo

## 3. Contas a Pagar / Receber

### 3.1 `AccountPayable`

**APIs:** `/api/accounts-payable` GET/POST/PATCH/DELETE (todos com `requirePermission("accounts_payable.manage")`).

**Status:** enum `AccountPayableStatus` (PENDING, ?, PAID, ?, CANCELED — verificar valores no enum exato).
**Baixa:** PATCH atualiza `paidDate`, `paidAmount`, `status`.
**Geração via RecurringExpense:** ver §2.6.
**Atomic:** PATCH usa `prisma.$transaction` (rel. 03).

### 3.2 `AccountReceivable`

**APIs:**
- `/api/accounts-receivable` GET/POST/PATCH/DELETE (com `accounts_receivable.manage`)
- `/api/accounts-receivable/[id]` GET/PATCH/DELETE
- `/api/accounts-receivable/[id]/penalties` GET — calcula multa/juros
- `/api/accounts-receivable/[id]/receipt` GET — gera recibo (PDF? HTML?)
- `/api/accounts-receivable/receive-multiple` POST — baixa com multi-pagamento

**Baixa parcial: ✅ Suportada.** `receive-multiple` (rel. 03 §4.7):
- Calcula `totalExpected = original + fineAmount + interestAmount - discountAmount`
- Aceita `payments[]` com diferentes métodos
- Valida `totalReceived <= totalExpected + 0.01`
- `isFullPayment = abs(totalReceived - totalExpected) < 0.01`
- Status final: `RECEIVED` (full) ou `PENDING` (partial)

**Atomic:** ✅ tudo dentro de `$transaction` (linha 121):
1. Update AccountReceivable (status, receivedAmount, receivedDate, fine/interest/discount, notes)
2. Para cada `payment`: cria `CashMovement` no caixa aberto (se branchId presente)

**🟠 Vulnerabilidades:**
- Cliente pode passar `fineAmount`, `interestAmount`, `discountAmount` no body sem validação contra cálculo automático (linha 94-96 do route).
- `BANK_TRANSFER → OTHER` e `BANK_SLIP → BOLETO` são mapeados artificialmente para PaymentMethod do enum.

### 3.3 Penalidades (`lib/penalty-utils.ts`)

`calculatePenalties(account, asOf)` — calcula multa/juros baseado em `account.finePercent`, `interestPercent`, `graceDays`, `dueDate` vs `asOf`. ⚪ não auditado em detalhe.

## 4. Saldo de cliente (crédito a favor)

❌ **NÃO ENCONTRADO** modelo `CustomerBalance` ou similar. Cliente que paga a mais → `receive-multiple` rejeita (`totalReceived > totalExpected + 0.01` → 400). 

🟡 **Limitação:** cliente não pode "deixar saldo" para próxima compra. Tem cashback (similar mas regras diferentes).

## 5. Cashback

### 5.1 Modelo
- `CashbackConfig` (por filial — sem companyId direto, ver rel. 04 §4)
- `CustomerCashback` (`customerId + branchId @@unique`, balance/totalEarned/totalUsed/totalExpired)
- `CashbackMovement` (CREDIT, DEBIT, EXPIRED, ADJUSTMENT, BONUS — com `expiresAt`)

### 5.2 Acúmulo
**Onde:** `cashbackService.earnCashback(customerId, saleId, total, branchId, companyId)` chamado em `sale.create:669` — **fora da transação principal**.

⚪ Implementação não lida em detalhe — provavelmente:
1. Pega `CashbackConfig` da filial
2. Verifica `total >= minPurchaseToEarn`
3. `earnAmount = total * earnPercent / 100`
4. Aplica `maxCashbackPerSale` se configurado
5. `expiresAt = now + expirationDays`
6. Atualiza `CustomerCashback` (balance/totalEarned), cria `CashbackMovement` CREDIT

### 5.3 Redenção
**Onde:** dentro de `sale.create:594-624` — debita do `CustomerCashback`, cria `CashbackMovement` DEBIT.

✅ Conectado ao fluxo de venda.

### 5.4 Expiração
⚪ Provavelmente via job (não vi cron schedule no código). `expiresAt` em `CashbackMovement`. `Reminder` engine pode dispatch via `/api/reminders` (CASHBACK_EXPIRING ContactType).

### 5.5 🔴 Limitação multi-filial
**Cashback é por filial.** Cliente acumula em loja A e **NÃO pode usar em loja B** da mesma empresa (modelo `CustomerCashback` exige `customerId + branchId`). Pode ser intencional, mas relevante.

## 6. Convênios (`Agreement`)

Schema linhas 1337+. `AgreementType`: HEALTH_PLAN, CORPORATE, UNION, ASSOCIATION, PARTNERSHIP. `AgreementBeneficiary` linka cliente ↔ convênio.

**Em `Sale`:** `agreementId` opcional + `agreementDiscount` Decimal(12,2).

**Glosa (parcial não aprovada):** ❌ **NÃO ENCONTRADO** mecanismo dedicado. Sistema apenas registra desconto.
**Comprovante de autorização:** ❌ **NÃO ENCONTRADO** anexo dedicado.
**Cobrança ao convênio:** Não há mecanismo claro de gerar fatura para convênio. ⚪ pode ser via AccountReceivable manual.

## 7. Reconciliação bancária

Modelos: `ReconciliationBatch`, `ReconciliationItem`, `ReconciliationRule`, `ReconciliationTemplate`.

APIs: 8 routes em `/api/finance/reconciliation/*` (ver rel. 03 §3.2).

**Funcionalidades suportadas:**
- Importar extrato bancário (`batches/[id]/import` POST)
- Auto-match contra pagamentos (`batches/[id]/auto-match` POST com `$transaction`)
- Resolver itens manualmente (`items/[itemId]/resolve` POST com `$transaction`)
- Fechar batch (`batches/[id]/close` POST com `$transaction`)
- Templates configuráveis para parsing
- Regras automáticas

**Páginas:** `/dashboard/financeiro/conciliacao` + `/[id]`.

✅ Sistema completo. Não auditado em profundidade — recomenda-se análise dedicada se for usado em produção.

## 8. 🔥 Análise monetária obrigatória

### 8.1 Decimal vs number
- **Backend:** trabalha com `Prisma.Decimal` (lib `@prisma/client/runtime/library`)
- **Antes de retornar JSON:** converte com `Number(decimal)` (visto em todas as routes que retornam Sale)
- **Frontend:** recebe e processa como number
- **Antes de chamar API:** envia como number puro
- **Backend recebe:** `data.amount` é number; passa direto para Prisma que converte de volta para Decimal

🟡 **Risco real**: para valores >= `Number.MAX_SAFE_INTEGER / 100` (~R$ 90 trilhões) há perda. Improvável, mas em queries de agregação anuais consolidadas pode aproximar.

🟠 **Risco mais real**: cálculos no frontend (`item.qty * item.unitPrice - discount`) podem ter erros de ponto flutuante (ex: `0.1 + 0.2 = 0.30000000000000004`). Se backend confia no `lineTotal` enviado, problema percola.

### 8.2 Parcelas — soma e centavos
`calculateInstallments(amount, count, firstDueDate, interval)` (`lib/installment-utils.ts`) — ⚪ não lido. **Como trata sobra de centavos?** Padrão comum: arredondar parcelas e ajustar a primeira/última. Precisa verificar.

🟡 Se cada parcela tiver `Math.round(amount/count, 2)`, a soma pode dar amount ± centavos.

### 8.3 Arredondamento — regra única?
❌ **NÃO há helper único.** Cada cálculo arredonda do seu jeito. Exemplos:
- `accounts-receivable/receive-multiple/route.ts:99`: `Math.round((originalAmount + fine + interest - discount) * 100) / 100`
- `sale.service.ts:400`: `item.qty * item.unitPrice - (item.discount || 0)` — sem arredondar
- `sale.service.ts:636`: `new Prisma.Decimal(baseAmount).mul(commissionPercent).div(100)` — Decimal.js (sem arredondar até gravar)

🟠 Inconsistência. Padrão único recomendado.

### 8.4 Frontend manda valor pronto?
**Sim.** Backend confia no `subtotal`, `discountTotal`, `total` enviados. **Não vi recálculo defensivo.** 🟠 risco de manipulação (cliente envia `total: 0.01`).

### 8.5 Relatórios usam mesmo critério?
⚪ INCERTO. Cada relatório (`/api/reports/*`) faz suas agregações próprias. Pode haver divergências entre o que o usuário vê na venda vs no relatório (ex: relatório agrega `Sale.total`, mas detalhamento mostra `subtotal - discount`).

## 9. Conciliação bancária — existe?

Sim. Ver §7. Cobertura aparenta ser completa.

## 10. Achados consolidados

| # | Achado | Classe | Onde |
|---|---|---|---|
| I1 | Abertura de caixa: check + create fora da transação → race condition pode criar 2 turnos OPEN | 🟠 | `cash.service.ts:30-77` |
| I2 | Schema sem partial unique index `(branchId, status=OPEN) WHERE status=OPEN` | 🟠 | `schema.prisma:1259` |
| I3 | `closeShift` não trava movimentos durante cálculo do esperado vs declarado | 🟡 | `cash.service.ts:90-157` |
| I4 | Cashback é **por filial** sem possibilidade cross-filial | 🟡/🔵 | rel. 04 §4 |
| I5 | Saldo de cliente (crédito a favor) **não existe** como modelo dedicado | 🟡 | grep |
| I6 | Convênio: glosa parcial não suportada | 🟡 | grep |
| I7 | Convênio: comprovante de autorização sem anexo dedicado | 🟡 | grep |
| I8 | RecurringExpense generate: race condition pode duplicar contas | 🟠 | `recurring-expenses/generate/route.ts:26-56` |
| I9 | Schema AccountPayable sem unique de período por RecurringExpense | 🟠 | rel. 04 §2.15 |
| I10 | `receive-multiple` aceita `fineAmount/interestAmount/discountAmount` do body sem revalidar | 🟠 | rel. 03 §4.7 |
| I11 | Mapeamento esquisito BANK_TRANSFER→OTHER e BANK_SLIP→BOLETO | 🟡 | rel. 03 §4.7 |
| I12 | `closeShift` calcula esperado SÓ com movimentos `method === "CASH"` (correto, mas não pega outros métodos para conferência) | 🟢 | `cash.service.ts:115` |
| I13 | `closeShift` exige justificativa se `\|diff\| > 0.01` ✅ | 🟢 | `cash.service.ts:128` |
| I14 | Backend confia em `total` do front sem recálculo | 🟠 | sale.service |
| I15 | Sem helper único de arredondamento monetário | 🟡 | grep |
| I16 | `calculateInstallments` — tratamento de centavos não auditado | ⚪ | `lib/installment-utils.ts` |
| I17 | Auto-fee de cartão silently fails (não bloqueia venda mas SalePayment fica sem feeAmount) | 🟡 | sale.service:482, quote.service:821 |
| I18 | RecurringExpense generate usa fuso UTC (provavelmente) — pode pular dia em SP | 🟡 | route linha 16 |
| I19 | Reconciliação bancária implementada (8 routes + serviço completo) | 🟢 | `/api/finance/reconciliation/*` |
| I20 | Cashback `earnCashback` chamado fora da transação principal da venda | 🟠 | sale.service:669 (rel. 07 H8) |
