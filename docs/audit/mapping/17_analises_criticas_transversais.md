# 17 — Análises Críticas Transversais

> Consolidação dos 4 vetores que aparecem em vários módulos: transações, idempotência/concorrência, valores monetários, datas/timezone.

## 1. 🔥 Transações Prisma (`prisma.$transaction`)

### 1.1 Tabela de fluxos críticos

| Fluxo | Usa $transaction? | Tabelas afetadas | Risco se falhar no meio | Severidade |
|---|---|---|---|---|
| **Criar venda** (`sale.create`) | ✅ Sim — `services/sale.service.ts:372` | Sale, SaleItem, SalePayment, BranchStock, Product, StockMovement, CashShift, CashMovement, Commission, AccountReceivable, CardReceivable, CustomerCashback, CashbackMovement | Estoque baixa mas venda não grava → estoque negativo (mitigado por rollback) | 🟢 Bem-feito |
| **Cancelar venda** (`sale.cancel`) | ✅ Sim — `sale.service.ts:763` | Sale, SaleItem, BranchStock, Product, StockMovement, SalePayment, CashMovement, CardReceivable (delete), AccountReceivable (cancel), Commission (cancel), FinanceEntry (delete), FinanceAccount (decrement) | Reversões parciais | 🟢 Bem-feito |
| **Devolver venda** (`refund`) | ✅ Sim — `refund/route.ts:25` | Refund, RefundItem, Product (only!), StockMovement, Sale (status), FinanceEntry (via service) | 🔴 BranchStock NÃO é atualizado → drift | 🔴 Bug |
| **Converter orçamento → venda** | ✅ Sim — `quote.service.ts:735` | Sale, SaleItem, SalePayment, Product (only!), CashMovement, Commission, Quote (status) | 🔴 NÃO cria AR/CR/FinanceEntry/Cashback | 🔴 Bug |
| **Reativar venda cancelada** | ⚪ Não auditado | ? | ? | ⚪ |
| **Abrir caixa** (`cash.openShift`) | ✅ Sim — `cash.service.ts:46` | CashShift, CashMovement | 🟠 check `existingOpen` fora tx → race | 🟠 |
| **Fechar caixa** (`cash.closeShift`) | ❌ Não — só update | CashShift | Movimento criado entre read e update altera diferença | 🟡 |
| **Sangria/Suprimento** | ❌ Não (operação simples create) | CashMovement | OK | 🟢 |
| **Baixar conta a receber (multi)** | ✅ Sim — `receive-multiple/route.ts:121` | AccountReceivable, CashMovement | 🟠 fine/discount do front sem revalidar | 🟠 |
| **Baixar conta a pagar** | ✅ Sim — `accounts-payable/route.ts` PATCH | AccountPayable, CashMovement (?) | OK | 🟢 |
| **Transferência de estoque (POST)** | ✅ Sim — `stock-transfers/route.ts:109` | StockTransfer, StockTransferItem, BranchStock (×2 filiais), StockMovement (×2) | Race entre check e debit | 🟠 |
| **Approve transferência** | ⚪ não 100% verificado | idem | idem | 🟠 |
| **Geração de parcelas STORE_CREDIT** | ✅ dentro da tx da venda | AccountReceivable | OK (com sale) | 🟢 |
| **Geração de comissão** | ✅ dentro da tx da venda | Commission | OK | 🟢 |
| **Generate RecurringExpense (mensal)** | ❌ Não — check + create separados | AccountPayable, RecurringExpense | 🟠 duplicação concorrente | 🟠 |
| **Aplicar cashback (ganho)** | ❌ FORA da tx da venda — `sale.service:669` | CustomerCashback, CashbackMovement | 🟠 cashback perdido se cashback service falhar | 🟠 |
| **Generate FinanceEntry (sale)** | ✅ dentro da tx, mas try/catch silencioso | FinanceEntry | 🟠 silently fails | 🟠 |
| **Generate FinanceEntry (refund)** | ✅ dentro da tx, idem | FinanceEntry | 🟠 silently fails | 🟠 |
| **Auto-fee de cartão (calculateCardFee)** | dentro da tx, try/catch silencioso | SalePayment.update | 🟡 fee=null se falhar | 🟡 |
| **Stock adjustment approve** | ⚪ não auditado | Product/BranchStock + StockMovement + StockAdjustment | ? | ⚪ |
| **Inventory lot create** | ✅ Sim — `inventory/lots/route.ts` | InventoryLot, BranchStock, Product | OK presumido | 🟢 |
| **Permission grant/revoke** | ✅ Sim — `users/[id]/permissions` | UserPermission upsert | OK | 🟢 |
| **Impersonation start** | ❌ Não (admin endpoint) | ImpersonationSession + GlobalAudit | OK (independentes) | 🟢 |
| **Reconciliation auto-match / close** | ✅ Sim | ReconciliationItem, SalePayment | OK presumido | 🟢 |

### 1.2 Padrão geral

✅ **A maioria dos fluxos críticos usa `$transaction`** — bom sinal.
🟠 **3 padrões problemáticos:**
1. **Check + create fora da transação** (cash open, recurring expenses, stock transfer)
2. **Operações fora da transação principal** (cashback ganho, fee de cartão como retry)
3. **try/catch silencioso dentro da transação** (FinanceEntry — venda completa, finance fica errada)

### 1.3 Falta isolation level
Nenhuma transação especifica `isolationLevel`. PostgreSQL default = `READ COMMITTED`. Para vendas concorrentes, **`SERIALIZABLE` ou explicit locking** seria mais seguro em alguns casos (ex: cash openShift). Mas `atomicStockDebit` compensa via UPDATE WHERE.

## 2. 🔥 Idempotência e Concorrência

### 2.1 Mecanismos disponíveis

| Mecanismo | Onde aparece |
|---|---|
| `@unique`/`@@unique` (DB constraint) | `Sale.serviceOrderId @unique`, `Sale.convertedFromQuoteId @unique`, `Quote.convertedToSaleId @unique`, `FinanceEntry @@unique([companyId, sourceType, sourceId, type, side])` |
| Status check antes de mutação | `sale.cancel` (linha 749), `receive-multiple` (linhas 75-87), `quote.cancel` (presumido) |
| Atomic UPDATE WHERE condition | `atomicStockDebit` (`WHERE quantity >= solicitado`) |
| Rate limit | apenas 3 routes |
| Idempotency key (header) | ❌ não usado |
| Locks pessimistas (`SELECT FOR UPDATE`) | ❌ não vi |
| Counter atomic | `getNextNumber` (Counter table) — ⚪ implementação não verificada |

### 2.2 Análise por fluxo

| Cenário | Proteção atual | Suficiente? |
|---|---|---|
| **Duplo clique em "Finalizar venda"** | Front: `disabled={loading}` (presumido); Back: rate limit 30/min/user | 🟡 mitigado (não 100%) |
| **Retry de request** | sem idempotency key — request retried = venda duplicada | 🔴 |
| **Duas abas finalizando o mesmo orçamento** | ✅ `Quote.convertedToSaleId @unique` impede dupla criação | 🟢 |
| **Duas vendas simultâneas baixando o mesmo estoque** | ✅ `atomicStockDebit` race-safe | 🟢 |
| **Geração duplicada de parcelas** | ❌ sem unique no schema | 🟠 |
| **Geração duplicada de comissão** | ❌ sem unique no schema | 🟠 |
| **Geração duplicada de FinanceEntry** | ✅ `@@unique([companyId, sourceType, sourceId, type, side])` | 🟢 |
| **Geração duplicada de RecurringExpense → AccountPayable** | ❌ check fora tx + sem unique | 🟠 |
| **Dois CashShift OPEN simultâneos** | ❌ check fora tx + sem partial unique | 🟠 |
| **Dupla aprovação de StockTransfer** | ❌ check de estoque fora tx | 🟠 |
| **Refund total da mesma venda 2× concorrente** | ⚪ sem check claro de "soma já devolvida" | 🟠 |

### 2.3 Recomendações pendentes (apenas trilha — não execução)

- Adicionar `@@unique([saleId, installmentNumber])` em `AccountReceivable`
- Adicionar `@@unique([recurringExpenseId, periodMonth, periodYear])` em `AccountPayable` (ou similar)
- Adicionar partial unique index `(branchId) WHERE status = 'OPEN'` em `CashShift` (PostgreSQL suporta)
- Adicionar header `Idempotency-Key` para POSTs críticos
- Adotar SERIALIZABLE em transações de venda

## 3. 🔥 Valores Monetários

### 3.1 Inconsistências de precisão (consolidado dos rels. 04 e 08)

| Padrão | Onde | Limite |
|---|---|---|
| `Decimal(12,2)` | majoritário (Sale, Quote, AP, AR, CashShift, CashMovement, Refund, Product, BranchStock) | R$ 9.999.999.999,99 |
| `Decimal(10,2)` | `Sale.cashbackUsed`, `SalePayment.feeAmount/netAmount`, `CardFeeRule.feeFixed`, `CashbackConfig.minPurchaseToEarn`, `CustomerCashback.balance/totalEarned/totalUsed/totalExpired` | R$ 99.999.999,99 |
| `Decimal(14,2)` | `FinanceEntry.amount`, `FinanceAccount.balance`, `InventoryLot.totalCost`, `SaleItemLot.totalCost` | R$ 999.999.999.999,99 |
| `Decimal(5,2)` (percentual) | `marginPercent`, `discountPercent`, `finePercent`, `interestPercent`, etc. | 999,99% |
| `Decimal(5,4)` (taxa fina) | `feePercent` em SalePayment, CardFeeRule, CardReceivable | 9,9999 (assume frações) |

🟠 **Risco overflow**: venda perto do limite + cálculo de cashback (10,2) ou fee (10,2) pode estourar. Improvável mas conceitualmente possível.

### 3.2 Conversões Decimal ↔ number

- **DB → API:** `Number(decimal)` antes de retornar (visto em todas routes)
- **Frontend:** trabalha com number puro
- **API → DB:** number passa direto, Prisma converte para Decimal
- **Risco**: para R$ > 90 trilhões há perda em `Number` (improvável)
- **Risco real**: cálculo no front (`a + b` JS) propaga erro de ponto flutuante para o backend

### 3.3 Onde o cálculo acontece

| Cálculo | Local | Recálculo no back? |
|---|---|---|
| `lineTotal = qty * unitPrice - discount` | front (PDV) | ❌ não vi recálculo |
| `total = sum(lineTotal) - discount` | front | ❌ não vi |
| `commissionAmount` | back ✅ (`sale.service:636`) | ✅ |
| `installments` | back ✅ (`calculateInstallments`) | ✅ |
| `feeAmount` (cartão) | back ✅ (`calculateCardFee`) | ✅ |
| `closingExpectedCash` | back ✅ (`cash.closeShift:115-122`) | ✅ |
| `penalty` (multa+juros) | back ✅ (`penalty-utils`) — front pode sobrescrever 🟠 | parcial |

🟠 **Vulnerabilidade explorável**: enviar `total: 0.01` no POST `/api/sales` provavelmente é gravado direto, criando uma venda fantasma de R$ 0,01. Confirmação requer teste em runtime. **Defesa recomendada**: backend recalcula `subtotal/total` a partir de `items[]`/`payments[]`.

### 3.4 Arredondamento

❌ **Sem helper único.** Cada cálculo arredonda do seu jeito:
- `Math.round((amount + fine + interest - discount) * 100) / 100` — em receive-multiple
- `Math.floor((total / count) * 100) / 100` — em calculateInstallments
- `new Prisma.Decimal(baseAmount).mul(percent).div(100)` — em commission (Decimal.js padrão)
- `Number(decimal).toFixed(2)` — em algumas formatações
- Sem arredondamento — em vários

🟠 **Padronizar para `bankerRounding(value, 2)` ou regra única do BCB**.

### 3.5 Parcelas — sobra de centavos

✅ `calculateInstallments` (rel. 13 §3) — última parcela recebe o resto. **Soma == total exato.** Bem-feito.

### 3.6 Relatórios usam mesmo critério?

⚪ INCERTO — cada relatório (`/api/reports/*`) faz suas próprias agregações. Risco de divergência: usuário vê venda de R$ 100,00 no detalhe, mas relatório consolidado mostra R$ 99,99 por arredondamento diferente.

## 4. 🔥 Datas e Timezone

### 4.1 Padrões observados

| Lib/abordagem | Onde |
|---|---|
| `date-utils.ts` (com `date-fns-tz`, fuso SP) | implementado, **mas adoção parcial** |
| `parseISO` (sem timezone) | `/api/finance/reports/dre` |
| `new Date()` direto | `/api/dashboard/sales-last-7-days`, `/api/dashboard/top-products` |
| Offset UTC-3 manual | `/api/dashboard/metrics` (linhas 22-28) |
| `addDays` (date-fns) | comum, ignora timezone |
| `dateOnlyToUTC` (helper SP) | usado em alguns lugares (sale.service em STORE_CREDIT, service-order.service:210) |

### 4.2 Bug clássico documentado

`new Date('2026-03-23')` = `2026-03-23T00:00:00Z` = **22/03 às 21h em SP**. `formatDateBR` (date-utils) e `dateOnlyToUTC` corrigem. Outros lugares: ⚠️.

### 4.3 Fuso do servidor

- **Vercel**: UTC
- **Banco Neon**: UTC
- **Cliente**: SP (UTC-3 sem DST)
- ✅ Decisão arquitetural correta: armazenar em UTC, converter na borda

### 4.4 Fechamento de caixa — risco de data

Caixa fecha em `closedAt = new Date()` — UTC. Em SP, 22h = 01h UTC do dia seguinte → fechamento aparece em "amanhã" em alguns relatórios. ⚠️.

### 4.5 Filtros de período

- `/dashboard/relatorios/dre`: cliente envia ISO. Se for date-only (`2026-03-01`), vai virar `2026-03-01T00:00:00Z` = `28/02 21h SP` → relatório agrega vendas erradas.
- `/api/dashboard/metrics`: usa offset manual UTC-3 ✅
- `/api/dashboard/sales-last-7-days`: 🟠 sem timezone

### 4.6 Vencimentos de parcela (`AccountReceivable.dueDate`)

- `calculateInstallments` usa `addDays(firstDueDate, i * intervalDays)` — preserva o componente date-only se o input for normalizado
- ⚪ se cliente enviar `2026-03-23T00:00:00Z`, o vencimento fica meia-noite UTC (= 21h do dia anterior em SP). Pode causar "vencido um dia antes" em relatórios.

### 4.7 Resumo

🟠 **`date-utils.ts` é completo e correto**, mas a adoção é parcial. **Consequência prática**: vendas registradas próximo da meia-noite SP podem cair no dia errado em alguns dashboards. Para uma ótica que fecha 18h, o impacto é baixo. Para um e-commerce 24h, seria significativo.

## 5. Resumo dos vetores transversais

| Vetor | Avaliação geral |
|---|---|
| **Transações** | ✅ Maioria dos fluxos críticos usa $transaction. 3 padrões problemáticos (check fora, fora da tx, try/catch silencioso). |
| **Idempotência** | 🟠 Mista. Alguns fluxos têm constraint DB (FinanceEntry, Quote→Sale ✅), outros faltam (AR, RecurringExpense, CashShift). |
| **Monetário** | 🟠 Decimal usado mas com precisões inconsistentes; backend confia em totals do front (manipulável). |
| **Datas/Timezone** | 🟠 Lib correta existe; adoção parcial. |
