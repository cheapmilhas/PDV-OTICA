# Relatório QA — Teste de Integração Código + Banco

**Data:** 2026-05-22
**Executor:** automação via scripts/qa-integration
**Duração total:** ~1 hora

---

## 1. Identificação do banco

| Campo | Valor |
|---|---|
| Projeto Neon | `OTICA PDV` (`purple-hill-80369768`) |
| Branch de PRODUÇÃO | `production` (`br-lingering-bonus-aire4xhm`, host `ep-blue-thunder-ai0x3r0a`) |
| **Branch de TESTE usado** | `teste-qa-2026-05-22` (`br-young-breeze-ai89gvvh`, host `ep-still-unit-ai1ixb6s`) |
| Empresa criada para isolar testes | `TESTE_QA_2026-05-22T20-53-36_Otica` (`cmphed4410000ol6pxw5rvxxk`) |
| PostgreSQL | 17.10 |
| `TEST_DATABASE_URL` | `.env.test.local` (gitignored via `.env*.local`) |

**Confirmação de segurança:** todos os scripts carregaram `.env.test.local`, reescreveram `process.env.DATABASE_URL` para o branch de teste e abortariam se a URL contivesse o fragmento `ep-blue-thunder` (host de prod). Dados de produção foram clonados ao branch (copy-on-write) e não foram tocados — toda escrita ocorreu na empresa nova `TESTE_QA_*`.

---

## 2. Resultado por cenário

| # | Cenário | PASS | FAIL | Observação |
|---|---|---:|---:|---|
| 1 | Setup (empresa, filial, ADMIN, 2 produtos) | 1 | 0 | OK |
| 2 | CRUD cliente + CPF (8 sub-testes) | 7 | 1 | FAIL em check-digit (BUG-MED-01) |
| 3 | Venda à vista CASH/PIX/DEBIT/CREDIT (8 sub-testes/método) | 12 | 4 | CASH+DEBIT timeout; PIX+CREDIT OK exceto FinanceEntry |
| 4 | Crediário STORE_CREDIT 3x + recebimento parcela | 9 | 2 | Service timeout — testado por via Prisma direto; FinanceEntry ausente |
| 5 | BALANCE_DUE + CardReceivable + validateCreditLimit | 8 | 0 | OK (validateCreditLimit funciona, limite default = R$500) |
| 6 | Cancelar venda PIX | 0 | 1 | `cancel()` quebra por schema drift |
| 7 | Soft-delete cliente com vendas | 3 | 0 | OK; AuditLog gerado |
| 8 | Isolamento multi-empresa | 3 | 0 | OK |
| 9 | Bordas (zero/negativo, timezone) | 3 | 0 | OK |

**Totais:** 46 PASS / 8 FAIL em 54 asserções concretas.

---

## 3. Bugs encontrados (consolidado, ordenado por severidade)

### CRÍTICO

#### BUG-CRIT-01 — Schema drift: 4 colunas faltam em `branch_stocks`
- **Sintoma:** qualquer query Prisma que faça `SELECT *` ou upsert em `BranchStock` quebra com `The column "branch_stocks.cost_price" does not exist in the current database`.
- **Diagnóstico:** `prisma/schema.prisma:2282` define `costPrice`, `salePrice`, `promoPrice`, `marginPercent` (4 colunas), mas a tabela `branch_stocks` no banco de produção tem só `id, branch_id, product_id, quantity, min_stock, max_stock, location, updated_at`. Migration para adicionar essas colunas nunca foi aplicada.
- **Confirmação:** `SELECT column_name FROM information_schema.columns WHERE table_name='branch_stocks'` mostra apenas 8 colunas. Schema espera 12.
- **Impacto direto observado:**
  - `atomicStockDebit` (stock.service.ts:52) quebra no caminho de erro
  - `saleService.cancel` (sale.service.ts:529) quebra 100% das vezes — **nenhuma venda pode ser cancelada em produção**
- **Reproduzir:** abrir o PDV, tentar cancelar qualquer venda → erro 500 do Prisma; vendedor pensa que cancelou mas a venda continua `COMPLETED`.

#### BUG-CRIT-02 — Transação de venda excede timeout default do Prisma (5s)
- **Sintoma:** `saleService.create` aborta com `Transaction already closed. The timeout for this transaction was 5000 ms, however 5XXX ms passed`.
- **Diagnóstico:** `sale.service.ts:391` chama `prisma.$transaction(async tx => {...})` SEM passar `{ timeout: N }`. Dentro da transação faz ~20 round-trips (Sale + items + payments + estoque + cashback + commission + FinanceEntry com múltiplos upserts). Em conexão Neon US-East a partir do Brasil (~140ms RTT), passa de 5s.
- **Comportamento:** CASH e DEBIT_CARD falham deterministicamente nesse ambiente; PIX e CREDIT_CARD ainda passaram porque o `applyFinanceEntriesInTx` engoliu o erro antes do timeout.
- **Em produção:** Em ambientes com latência alta (cliente longe do datacenter, congestionamento de rede), vendedor vê "erro genérico do Prisma" e perde a venda. Em ambientes com latência baixa (Vercel próximo a Neon) provavelmente não acontece, mas é bomba-relógio.
- **Fix proposto:** `prisma.$transaction(async tx => {...}, { timeout: 30_000, maxWait: 5_000 })`. Sale.service.ts:391.

#### BUG-CRIT-03 — Empresas sem onboarding completo não têm ChartOfAccounts → vendas não aparecem no Financeiro
- **Sintoma:** Sale é criada com sucesso (status COMPLETED), CashMovement é gerado, mas `applyFinanceEntriesInTx` falha silenciosamente com `Conta contábil não encontrada: 1.1.03`. Log estruturado registra mas a UI não avisa.
- **Diagnóstico:** `finance-entry.service.ts:23` (getChartAccountByCode) busca códigos como `1.1.03` (Caixa), `1.1.04` (Cartão), `1.1.05` (Crediário), `3.1.01` (Receita de Vendas). Esses códigos são populados por `setupCompanyFinance` (finance-setup.service.ts:79) que só é chamado no fluxo de onboarding do admin/self-service.
- **Risco:** qualquer empresa criada por outra via (import, fix manual, admin tools, seed) não tem o plano de contas. Vendas funcionam mas DRE/Cash-Flow ficam silenciosamente vazios. **Possivelmente várias empresas em produção têm esse drift** — auditar via `SELECT companyId FROM Company WHERE id NOT IN (SELECT DISTINCT companyId FROM ChartOfAccounts WHERE code='1.1.03')`.
- **Fix proposto:** chamar `setupCompanyFinance` em todo caminho de criação de Company, ou criar migration de backfill.

#### BUG-CRIT-04 — `saleService.cancel` quebra 100% por schema drift (BranchStock)
- Mesmo root cause do BUG-CRIT-01. Documentado separadamente porque o impacto operacional é específico: **nenhuma venda pode ser cancelada**. Em produção, ao clicar "Cancelar venda", o Prisma quebra na linha `sale.service.ts:529` (tx.branchStock.upsert). Venda permanece COMPLETED mesmo após o usuário receber feedback de erro.

### ALTO

#### BUG-ALTO-01 — Criação de Product não popula BranchStock automaticamente
- **Sintoma:** Criar Product e tentar vendê-lo na primeira venda → "Estoque insuficiente" mesmo com `Product.stockQty > 0`. Tecnicamente o sistema usa BranchStock como fonte de verdade por filial, e o cadastro de produto não cria a linha.
- **Fix proposto:** ao criar Product, criar BranchStock(branchId, productId, quantity = Product.stockQty) para todas as filiais ativas. Ou ao primeiro INSERT em branch_stocks via upsert dentro do atomicStockDebit (já há `upsert` no cancel — replicar no debit).
- **Arquivo:** `src/services/product.service.ts` (sem criação de BranchStock), `src/services/stock.service.ts:39-80` (atomicStockDebit assume linha existente).

#### BUG-ALTO-02 — atomicStockDebit no caminho de erro vaza Prisma exception
- **Sintoma:** quando `updated.count === 0` (estoque insuficiente OU BranchStock inexistente), o fallback `findUnique` em `stock.service.ts:52` faz SELECT que inclui cost_price → quebra com 500 em vez de retornar a mensagem amigável "Estoque insuficiente".
- **Fix:** usar `findUnique({ ..., select: { quantity: true } })` para evitar selecionar colunas Decimal ausentes.

#### BUG-ALTO-03 — Recebimento de Conta a Receber NÃO gera FinanceEntry
- **Sintoma:** Marcar parcela como `RECEIVED` via PATCH `/api/accounts-receivable` (com paymentMethod) cria CashMovement mas NUNCA gera FinanceEntry. Resultado: parcela some de "A Receber", entra no Caixa, mas **não vai pro DRE/cash-flow** como receita.
- **Fix:** depois do `tx.cashMovement.create` (route.ts:535), chamar generateReceivableEntries ou similar.
- **Arquivo:** `src/app/api/accounts-receivable/route.ts:511-549`.

#### BUG-ALTO-04 — `prisma.accountReceivable.update` direto não dispara side-effect de caixa
- **Sintoma:** se algum código (ou job, ou admin) atualiza `AccountReceivable.status = RECEIVED` direto via Prisma sem usar o handler PATCH, **nem CashMovement nem FinanceEntry são criados**. Inconsistência silenciosa.
- **Fix:** middleware Prisma ou trigger do Postgres. Idealmente extrair a lógica do PATCH para um service `receiveInstallment(arId, paymentMethod, userId)` e proibir update direto via lint.

### MÉDIO

#### BUG-MED-01 — Validação de CPF não valida dígito verificador
- **Sintoma:** `createCustomerSchema.parse({ cpf: '11111111111' })` é aceito. CPF `00000000000`, `11111111111`, etc., e qualquer 11 dígitos aleatórios passam.
- **Diagnóstico:** regex em `src/lib/validations/customer.schema.ts:5` é apenas `/^\d{11}$/`.
- **Impacto:** base de dados de clientes acumula CPFs inválidos. Cliente sem CPF real pode burlar `@@unique([companyId, cpf])` colocando lixo. Auditoria fiscal futura quebra.
- **Fix:** adicionar `.refine(validateCPFCheckDigit)` no schema.

### BAIXO

#### BUG-BAIXO-01 — Timezone (America/Sao_Paulo) não validado end-to-end
- Não foi possível validar em runtime se vendas próximas à meia-noite caem no dia correto em relatórios, porque o `saleService.create` falhou por timeout antes de conseguirmos reproduzir o cenário. Auditoria estática mostra uso de `startOfLocalDay`/`endOfLocalDay` em `src/lib/date-utils.ts`, o que sugere intenção correta, mas é necessário cobrir com teste manual.

---

## 4. Comportamentos validados como CORRETOS

- ✅ Multi-tenancy: cross-tenant `findByCPF`/`getById` retorna null/notFound (Cenário 8)
- ✅ Soft-delete de Customer marca `active=false` sem cascatear nas vendas, e gera 3 entradas de AuditLog (Cenário 7)
- ✅ Zod rejeita CPF com tamanho errado, com pontuação, valores zero/negativos (Cenários 2, 9)
- ✅ Cliente duplicado por CPF na mesma empresa é bloqueado pelo service (Cenário 2)
- ✅ STORE_CREDIT gera N AccountReceivable com `installmentNumber` 1..N, `totalInstallments=N`, soma das parcelas = total (Cenário 4)
- ✅ CardReceivable é criado para CREDIT_CARD com expectedDate populada e status PENDING (Cenário 5)
- ✅ BALANCE_DUE gera AR única com `dueDate = ServiceOrder.promisedDate` (Cenário 5)
- ✅ `validateCreditLimit` bloqueia valor que excede limite (default R$500 do SystemRule) — testado com R$ 999.999.999 (Cenário 5)
- ✅ Venda PIX (única que executou completa) gerou Sale + SaleItem + SalePayment + StockMovement type=SALE + CashMovement direction=IN
- ✅ Venda aparece em `saleService.list({ customerId })` (histórico do cliente)
- ✅ Recebimento de parcela COM paymentMethod (via lógica do handler PATCH) cria CashMovement

---

## 5. Arquivos criados/modificados durante o teste

Todos em `scripts/qa-integration/` (não-rastreados pelo git, fora `.env.test.local` que é gitignored):

| Arquivo | Propósito |
|---|---|
| `.env.test.local` | Connection string do branch de teste (gitignored) |
| `scripts/qa-integration/_env-shim.ts` | Carrega `.env.test.local` e reescreve DATABASE_URL com guardrail anti-prod |
| `scripts/qa-integration/_prisma.ts` | Factory Prisma standalone (não usa singleton do projeto) |
| `scripts/qa-integration/_state.ts` | Helpers de estado e gravação de resultados |
| `scripts/qa-integration/00-sanity.ts` | Sanity check de conexão |
| `scripts/qa-integration/01-setup.ts` | Setup empresa, filial, ADMIN, produtos |
| `scripts/qa-integration/02-customer.ts` | CRUD cliente |
| `scripts/qa-integration/02b-cpf-format-fix.ts` | Patch de assertion Zod v3 vs v4 |
| `scripts/qa-integration/02c-record-bugs-and-prepare-branchstock.ts` | Registra bugs do BranchStock + workaround para destravar |
| `scripts/qa-integration/03-sale-cash.ts` | Vendas CASH/PIX/DEBIT/CREDIT |
| `scripts/qa-integration/03b-finance-setup.ts` | Roda `setupCompanyFinance` na empresa de teste |
| `scripts/qa-integration/03c-retry-cash-debit.ts` | Re-tenta as 2 falhas por timeout |
| `scripts/qa-integration/04-crediario.ts` | STORE_CREDIT (via service — falhou timeout) |
| `scripts/qa-integration/04b-crediario-bypass.ts` | STORE_CREDIT via Prisma direto |
| `scripts/qa-integration/04c-receipt-with-method.ts` | Recebimento de parcela replicando handler PATCH |
| `scripts/qa-integration/05-balance-due-and-card.ts` | BALANCE_DUE + CardReceivable + validateCreditLimit |
| `scripts/qa-integration/06-08-09-final.ts` | Cancelar venda + isolamento + bordas |
| `scripts/qa-integration/06b-record-cancel-bug.ts` | Registra bug do cancel |
| `scripts/qa-integration/diagnose-branchstock.ts` | Diagnóstico de colunas do banco |
| `scripts/qa-integration/.state.json` | Estado/resultados (gitignored) |
| `RELATORIO_QA_INTEGRACAO.md` | Este relatório |

**Dados criados no branch de teste** (todos com prefixo `TESTE_QA_2026-05-22T20-53-36`):
- 2 Companies (A e B para teste de isolamento)
- 3 Branches
- 1 ADMIN User
- 2 Products (Frame e Lens)
- 1 Customer
- 4 Sales (PIX, CREDIT_CARD, STORE_CREDIT via bypass, BALANCE_DUE via bypass)
- 4 AccountReceivable (3 crediário + 1 BALANCE_DUE)
- 1 CardReceivable
- 1 ServiceOrder
- StockMovements, CashMovements, BranchStocks correspondentes
- 34 ChartOfAccounts + 4 FinanceAccount (via setupCompanyFinance)

**Limpeza:** o branch Neon inteiro será deletado ao final, removendo todos esses dados de uma vez sem afetar produção. (Aguardando autorização final.)

---

## 6. Recomendações prioritizadas

1. **URGENTE** — Aplicar migration faltante para adicionar `cost_price`, `sale_price`, `promo_price`, `margin_percent` em `branch_stocks`. Sem isso, cancelamento de venda está quebrado em produção (BUG-CRIT-01, BUG-CRIT-04). Verificar arquivo `prisma/migrations/` para descobrir se a migration existe mas não foi aplicada.
2. **URGENTE** — Auditar quais Companies em produção têm `ChartOfAccounts` populado. SQL:
   ```sql
   SELECT c.id, c.name FROM "Company" c
   LEFT JOIN "ChartOfAccounts" coa
     ON coa."companyId" = c.id AND coa.code = '1.1.03'
   WHERE coa.id IS NULL;
   ```
   Para cada uma sem plano de contas, rodar `setupCompanyFinance` (BUG-CRIT-03).
3. **ALTO** — Adicionar `{ timeout: 30_000 }` no `prisma.$transaction` de `saleService.create` e `quoteService.convertToSale` (BUG-CRIT-02).
4. **ALTO** — Refatorar handler PATCH de `/api/accounts-receivable` para chamar um service `receiveInstallment` que faça (em uma só tx) `AR.update + CashMovement.create + FinanceEntry.create` (BUG-ALTO-03, BUG-ALTO-04).
5. **ALTO** — Ao criar Product, garantir BranchStock para todas as filiais ativas (BUG-ALTO-01).
6. **MÉDIO** — Adicionar validação de dígito verificador no schema de CPF (BUG-MED-01).
