# 14 — Inconsistências e Pontos de Atenção

> Apenas itens com evidência. Cada item tem classificação **🔴/🟠/🟡/🔵/⚪** e referência de origem (rel. + linha/arquivo).

## Tabela mestre

### 🔴 CONFIRMADOS — bugs/inconsistências comprovadas no código

| # | Achado | Arquivo + linha | Origem |
|---|---|---|---|
| 1 | `Quote.convertToSale` decrementa `Product.stockQty` mas **NÃO atualiza `BranchStock`** | `src/services/quote.service.ts:766-774` | rel. 07 H2, rel. 09 J2 |
| 2 | `Sales.refund` decrementa `Product.stockQty` mas **NÃO atualiza `BranchStock`** (estoque drift) | `src/app/api/sales/[id]/refund/route.ts:122-129` | rel. 07 H3, rel. 09 J3 |
| 3 | `Quote.convertToSale` **NÃO cria** `AccountReceivable` para STORE_CREDIT/BALANCE_DUE | `src/services/quote.service.ts:735-908` | rel. 07 H1 |
| 4 | `Quote.convertToSale` **NÃO cria** `CardReceivable` para CREDIT_CARD | idem | rel. 07 H1 |
| 5 | `Quote.convertToSale` **NÃO chama** `cashbackService.earnCashback` | idem | rel. 07 H1 |
| 6 | `Quote.convertToSale` **NÃO gera** `FinanceEntry` (DRE quebra para vendas convertidas) | idem | rel. 07 H1 |
| 7 | `/api/sales/[id]/refund` **NÃO usa** `requirePermission` — qualquer logado devolve | `refund/route.ts:8-19` | rel. 03 C2 |
| 8 | `validateCreditLimit` em `installment-utils.ts:67-75` é **stub** que sempre aprova; sale.service crê que valida | `lib/installment-utils.ts:72` | rel. 13 N2 |
| 9 | `permissions.ts` (TS) usa `MANAGER/SELLER/CASHIER/STOCK_MANAGER`; Prisma enum usa `GERENTE/VENDEDOR/CAIXA/ATENDENTE`. ROLE_PERMISSIONS nunca aplica para roles reais (exceto ADMIN) | `lib/permissions.ts:93` vs `schema.prisma:3167` | rel. 05 F1 |
| 10 | `ATENDENTE` (DB) **sem mapeamento padrão** em `permissions.ts` | `lib/permissions.ts:98-276` | rel. 05 F2 |
| 11 | `hasPermission(userRole, …)` em `lib/permissions.ts:281` é **armadilha** — sempre `false` para roles do DB | `lib/permissions.ts:281-288` | rel. 05 F4 |
| 12 | `console.log` em produção com email/role de auth | `src/auth.ts:76, 84, 98, 126, 142, 150` | rel. 01 A3, rel. 05 E1 |
| 13 | `usePermission` (hook) faz `console.log` com email + lista completa de permissões em produção | `hooks/use-permission.ts:43, 61-63, 81, 86` | rel. 05 F6 |
| 14 | `Customer.acceptsMarketing` default `true` (LGPD opt-in violado) | `schema.prisma:385` | rel. 04 D3, rel. 10 K1, rel. 15 |
| 15 | Middleware aceita cookie sem validar JWT (só presença) — bypass possível com cookie forjado de mesmo nome | `src/middleware.ts:96-99` | rel. 01 A1, rel. 06 G4 |
| 16 | `/api/admin/seed` **reseta a senha admin para `admin123`** (idempotente mas destrutivo) | `src/app/api/admin/seed/route.ts:27-32` | rel. 03 C10 |
| 17 | `/api/barcodes/generate-image` público sem auth ou rate limit (abuse / DoS) | `src/app/api/barcodes/generate-image/route.ts` | rel. 03 §5 |
| 18 | `Refund` finance entries em try/catch silencioso — venda revertida mas finance fica errada | `refund/route.ts:146-150` | rel. 03 C4 |
| 19 | `sale.create` finance entries em try/catch silencioso (linha 655-661) | `services/sale.service.ts:655` | rel. 07 H9 |

### 🟠 RISCO PROVÁVEL — forte indício, precisa runtime test

| # | Achado | Arquivo + linha | Origem |
|---|---|---|---|
| 20 | Backend **confia em `total`/`subtotal`/`discount`** enviados pelo front (sem recálculo defensivo confirmado) — manipulação de preço possível | `services/sale.service.ts:280-450` | rel. 07 H17, rel. 08 I14 |
| 21 | `cash.openShift` check `existingOpen` fora da transação → race condition pode abrir 2 turnos | `services/cash.service.ts:30-77` | rel. 08 I1 |
| 22 | `RecurringExpense.generate` check + create fora da transação → duplicação possível | `recurring-expenses/generate/route.ts:26-56` | rel. 08 I8 |
| 23 | `StockTransfer.approve` check de estoque fora da transação | `stock-transfers/[id]/route.ts:47-58` | rel. 09 J6 |
| 24 | `accounts-receivable/receive-multiple` aceita `fineAmount/interestAmount/discountAmount` do body sem revalidar | `receive-multiple/route.ts:94-96` | rel. 03 C7, rel. 08 I10 |
| 25 | ~17 routes com `branchId` no body **sem** `validateBranchOwnership` | grep | rel. 06 G3 |
| 26 | Routes de relatório **sem `requirePermission`** — proteção apenas no front | grep | rel. 11 L1 |
| 27 | `next.config.ts` sem CSP, sem HSTS | `next.config.ts:17-29` | rel. 01 A5 |
| 28 | ENVs no código sem documentação em `.env.example` (`AUTH_SECRET`, Supabase) | `.env.example` vs grep | rel. 01 A6 |
| 29 | Rate limit aplicado em apenas **3 routes** (sales, cash open, cash close) | grep | rel. 03 §6, rel. 13 N6 |
| 30 | `Customer` sem `consentGivenAt`, `consentVersion`, `anonymizedAt` | schema 367-419 | rel. 10 K2-K4 |
| 31 | Sem endpoint dedicado para **anonimização LGPD** | grep | rel. 10 K3 |
| 32 | Sem endpoint **exportar dados do titular** (LGPD art. 18, II) | grep | rel. 10 K4 |
| 33 | `cashbackService.earnCashback` chamado **fora da transação** principal da venda | `services/sale.service.ts:669-680` | rel. 07 H8, rel. 08 I20 |
| 34 | Páginas `/dashboard/caixa`, `/dashboard/ordens-servico*`, `/dashboard/vendas/[id]/detalhes` **sem ProtectedRoute** | rel. 02 §4 | rel. 02 |
| 35 | 7 páginas com permissão semanticamente errada (`*.create` no lugar de `*.view`) | rel. 02 §5 | rel. 02 |
| 36 | `AccountReceivable` schema **sem unique** `[saleId, installmentNumber]` para impedir duplicata | rel. 04 §2.16 | rel. 04 D7 |
| 37 | `RecurringExpense → AccountPayable` sem unique de período | rel. 04 §2.15 | rel. 04 D8 |
| 38 | `CashShift` schema sem partial unique `(branchId, status=OPEN)` | rel. 04 §2.12 | rel. 04 D6, rel. 08 I2 |
| 39 | Devolução parcial pode acumular: sem check de `sum(refundItems.qty)` <= `saleItem.qty` em chamadas sucessivas | `refund/route.ts` | rel. 07 H13 |
| 40 | `Lab.apiKey` armazenado em texto puro (sem cifragem) | `schema.prisma:457` | rel. 10 K11 |
| 41 | Timezone usado de forma inconsistente em `/api/dashboard/sales-last-7-days` (sem UTC-3) | rel. 11 L5 | rel. 11 |
| 42 | `/api/reports/sales-evolution` faz N+1 em loop (1 query por mês) | linha 17-25 | rel. 11 L2 |

### 🟡 SUSPEITAS — algo estranho, sem prova suficiente

| # | Achado | Origem |
|---|---|---|
| 43 | Coexistência de `sonner` + `react-hot-toast` (duas libs de toast) | rel. 01 A7, rel. 12 M1 |
| 44 | Hooks `use-permission` (kebab) + `usePermissions` (camel) com APIs ligeiramente diferentes | rel. 01 A8, rel. 05 F5 |
| 45 | `next.config.ts` libera `<Image>` apenas de `localhost` (produção pode usar Supabase) | rel. 01 A4 |
| 46 | `PrismaAdapter` desativado em NextAuth v5 beta (sessões só JWT) | rel. 01 A2, rel. 05 E2, F13 |
| 47 | `@anthropic-ai/sdk` instalado, sem ENV em `.env.example` | rel. 01 A9 |
| 48 | Schema 3.820 linhas com apenas 5 migrations (drift potencial) | rel. 01 A10 |
| 49 | `Sale.cashbackUsed` Decimal(10,2) vs total Decimal(12,2) | rel. 04 D11 |
| 50 | `SalePayment.feeAmount/netAmount` Decimal(10,2), `amount` Decimal(12,2) | rel. 04 D12 |
| 51 | `FinanceEntry.amount` Decimal(14,2) — limite diferente | rel. 04 D13 |
| 52 | `Cashback*`/`Reminder*` por filial sem `companyId` direto | rel. 04 §4, rel. 06 G7 |
| 53 | `convertedToOsId` não unique (vs `convertedToSaleId @unique`) | rel. 04 §2.5 |
| 54 | `RecurringExpense.frequency` String sem enum | rel. 04 D16 |
| 55 | `CardReceivable.status`, `Refund.refundMethod` Strings sem enum | rel. 04 D17 |
| 56 | Polimorfismo via String em `CashMovement.originType/originId` (sem FK) | rel. 04 D15 |
| 57 | `prescriptionData` Json em ServiceOrder/QuoteItem (sem schema validado) | rel. 04 D14 |
| 58 | Templates de importação públicos sem auth (clientes/produtos/fornecedores) | rel. 03 §5, rel. 10 K6 |
| 59 | Branch selector (front) — backend honra branchId do contexto front (não session)? INCERTO | rel. 06 G6, rel. 12 M12 |
| 60 | Maioria dos formulários NÃO usa `react-hook-form` (apenas 3 arquivos) | rel. 12 M2 |
| 61 | Sem componente único de "Empty State" / "Loading Skeleton" | rel. 12 M3 |
| 62 | `sale.create` auto-abre caixa se não houver — pode surpreender o operador | rel. 07 H16 |
| 63 | Auto-fee de cartão silenciosamente falha em sale.create e quote.convertToSale | rel. 08 I17 |
| 64 | Mapeamento esquisito de método em `receive-multiple`: BANK_TRANSFER→OTHER, BANK_SLIP→BOLETO | rel. 03/08 I11 |
| 65 | Sem helper único de arredondamento monetário | rel. 08 I15 |
| 66 | DEBIT_CARD em `METHODS_IN_CASH` — conceito mas não dinheiro físico | rel. 13 §4 |
| 67 | Login secundário com sufixo `@login` colide se houver email assim | rel. 05 F14, rel. 01 |
| 68 | Schema Postgres sem CHECK constraint impedindo `stockQty < 0` | rel. 09 J11 |
| 69 | `BranchStock` tem override de preço (`salePrice`, `costPrice`) — qual prevalece? INCERTO | rel. 09 J12 |
| 70 | `CommissionRule` schema robusto, mas `sale.create` usa só `User.defaultCommissionPercent` | rel. 09 J9 |

### 🔵 MELHORIAS — não é bug, é oportunidade

| # | Achado | Origem |
|---|---|---|
| 71 | Cashback é por filial — pode ser intencional, mas é decisão de produto significativa | rel. 04 D2 |
| 72 | `User` sem soft delete (só `active`) | rel. 04 D19 |
| 73 | Sem mecanismo de inventário cíclico/contagem | rel. 09 J8 |
| 74 | `GlobalAudit` sem TTL/particionamento — cresce indefinidamente | rel. 04 D18 |
| 75 | `prisma-tenant.ts` (tenant extension) implementado mas não usado — adotar globalmente OU remover | rel. 06 G1 |
| 76 | Saldo de cliente (crédito a favor) não existe como modelo dedicado | rel. 08 I5 |
| 77 | Convênio: glosa parcial e comprovante de autorização não suportados | rel. 08 I6, I7 |
| 78 | OS números sequenciais por empresa, misturam entre filiais | rel. 04 D20, rel. 07 H11 |

### ⚪ NÃO TESTADO — precisa runtime ou consulta

| # | Achado | Origem |
|---|---|---|
| 79 | `Quote.convertToSale` valida `status === APPROVED` antes? Não confirmado | rel. 07 H1 |
| 80 | `getNextNumber` (Counter) — atomicidade real | rel. 07 H12 |
| 81 | `/api/sales/[id]/reactivate` — comportamento e simetria com cancel | rel. 07 H15 |
| 82 | `StockReservation` modelo existe mas uso real INCERTO | rel. 09 J7 |
| 83 | `SystemRule.stock.*` chaves existem; consulta runtime INCERTO | rel. 09 J10 |
| 84 | `Network.sharedCatalog` — implementação real INCERTO (vazamento entre empresas?) | rel. 06 G8, G12 |
| 85 | Impersonation `endedAt` setado ao logout? | rel. 06 G10 |
| 86 | Audit log para acesso/edição de prescrição | rel. 10 K1+ |
| 87 | Botões críticos (devolver/converter/aprovar/baixar conta) — proteção contra duplo clique | rel. 12 M8 |
| 88 | `Lab` integration (`apiUrl`, `apiKey`) — uso real | grep |

## Códigos de qualidade — números brutos

| Métrica | Valor | Comando |
|---|---|---|
| `console.*` em `src/` | **308** | `grep -rE "console\.(log\|debug\|info\|warn\|error)\(" src` |
| `: any` ou `as any` ou `<any>` em `src/` | **578** | `grep -rE ":\s*any\b\|<any>\|as any" src` |
| `@ts-ignore`/`@ts-expect-error` | **1** | `grep -rE "@ts-(ignore\|expect-error)" src` |
| `TODO`/`FIXME`/`HACK`/`XXX` | **13** | `grep -rE "TODO\|FIXME\|HACK\|XXX" src` |
| `$queryRaw`/`$executeRaw` | **7 arquivos** | `grep -rln '\\\$queryRaw\|\\\$executeRaw' src` |
| `dangerouslySetInnerHTML` | **1** (JSON-LD seguro) | `grep -rln "dangerouslySetInnerHTML" src` |

### TODOs encontrados (relevantes)

| # | TODO | Arquivo:linha |
|---|---|---|
| 1 | "buscar cashback real" | `crm/templates/[segment]/message/route.ts:87` |
| 2 | "calcular despesas" | `cash-registers/route.ts:101` |
| 3 | "Implementar se houver regra de limite de crédito" 🔴 (já listado em #8) | `installment-utils.ts:72` |
| 4 | "calcular clientes do período anterior" | `services/reports.service.ts:811` |
| 5 | "Buscar cashback do cliente" | `services/crm.service.ts:63` |
| 6 | "Calcular somando Sale.total de vendas convertidas" | `services/quote.service.ts:583` |

### `$queryRaw`/`$executeRaw` — análise

Arquivos:
- `src/services/stock.service.ts` — atomicStockDebit/Credit (rel. 09 J1) ✅ parametrizado
- `src/services/customer.service.ts` — ⚪ verificar
- `src/services/product.service.ts` — ⚪ verificar
- `src/services/product-campaign.service.ts` — ⚪ verificar
- `src/app/api/products/print/route.ts` — ⚪ verificar
- `src/app/api/dashboard/metrics/route.ts` — ⚪ verificar
- `src/app/api/reports/branch-comparison/route.ts` — ⚪ verificar

**Risco SQL injection**: Prisma `$queryRaw` com tagged template literals é seguro (parametrizado). `$queryRawUnsafe` seria perigoso — não vi uso. ⚪ confirmar com grep mais específico.

### Migrations vs schema — drift?

Schema 3.820 linhas, 130 models. Apenas 5 migrations:
1. `20260216111301_add_laboratory_to_service_order`
2. `20260326_sprint1_saas_admin_evolution`
3. `20260328_add_card_receivable`
4. `20260328_add_recurring_expenses`
5. `20260331_add_impersonation_audit`

🟡 **SUSPEITA**: schema crescente bem além do que migrations descrevem. Possível uso intenso de `prisma db push` antes da consolidação. Verificar com `npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma` (somente leitura, mas não está na lista PERMITIDOS — não rode).

## Resumo numérico

| Severidade | Contagem |
|---|---|
| 🔴 CONFIRMADO | 19 |
| 🟠 RISCO PROVÁVEL | 23 |
| 🟡 SUSPEITA | 28 |
| 🔵 MELHORIA | 8 |
| ⚪ NÃO TESTADO | 10 |
| **Total** | **88** |
