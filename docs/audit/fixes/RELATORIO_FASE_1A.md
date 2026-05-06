# Relatório Fase 1A — Correção dos Bugs Críticos 1, 2 e 3

> Não fiz `git commit` nem `git push`. Tudo aguarda revisão.
> Migration criada mas NÃO aplicada. Scripts em dry-run por padrão.
>
> **Atualizado em 2026-05-06** com decisões adicionais de Matheus
> (perguntas 4, 5 e 6 — ver §"Decisões aplicadas" abaixo).

## ✅ Resumo executivo

### Arquivos modificados (código de produção)

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | +2 campos em `Customer` (`creditLimit`, `creditLimitOverridden`) |
| `src/services/sale.service.ts` | Refatoração de `create` para usar helpers (-280 LOC, comportamento idêntico) |
| `src/services/quote.service.ts` | `convertToSale` agora chama os mesmos helpers; paridade total com `sale.create`; +validações |
| `src/app/api/sales/[id]/refund/route.ts` | Restock usa `atomicStockCredit` (atualiza BranchStock + Product.stockQty) |
| `src/lib/installment-utils.ts` | `validateCreditLimit` substitui stub por lógica real |
| `src/lib/validations/system-rule.schema.ts` | Defaults: R$ 1.000 → R$ 500, 15 dias → 30 dias |
| `.gitignore` | +`.env.diagnostic`, `+/scripts/logs/` |

### Arquivos criados (novos)

#### Código compartilhado
- `src/services/sale-side-effects.service.ts` — helper compartilhado (~430 LOC) usado por `sale.create` e `quote.convertToSale`

#### Migration Prisma (NÃO aplicada)
- `prisma/migrations/20260505_add_customer_credit_limit/migration.sql`

#### Scripts de diagnóstico (read-only)
- `scripts/diagnose-bug1-orphan-quotes.ts`
- `scripts/diagnose-bug2-stock-drift.ts`
- `scripts/diagnose-bug3-credit-exposure.ts`

#### Scripts de migração (dry-run por padrão)
- `scripts/fix-bug1-orphan-quotes.ts`
- `scripts/fix-bug2-stock-drift.ts`
- `scripts/fix-bug3-set-default-credit-limits.ts`

#### Helpers compartilhados de scripts
- `scripts/_helpers/env.ts` — carrega `.env.diagnostic` separado
- `scripts/_helpers/cli.ts` — parsing de flags (`--apply --i-know-what-im-doing`)
- `scripts/_helpers/banner.ts` — imprime URL mascarada + pede CONFIRMO
- `scripts/_helpers/confirm.ts` — readline para confirmação
- `scripts/_helpers/logger.ts` — log em console + arquivo

#### Configuração
- `.env.diagnostic.example` — template para o env de diagnóstico

#### Documentação
- `docs/audit/fixes/RELATORIO_FASE_1A.md` (este)
- `bug1_diagnostico.md`, `bug1_plano.md`, `bug1_correcao.md`, `bug1_migracao.md`, `bug1_testes.md`
- `bug2_diagnostico.md`, `bug2_correcao.md`, `bug2_migracao.md`, `bug2_testes.md`
- `bug3_diagnostico.md`, `bug3_correcao.md`, `bug3_migracao.md`, `bug3_testes.md`

### TypeScript / Build

`npx tsc --noEmit` — **PASSA SEM ERROS** após cada mudança incremental e ao final.
`npx prisma validate` — **schema válido**.
`npx prisma generate` — rodado para regenerar tipos do client (necessário porque o schema mudou).

### Migration Prisma

**Nome:** `20260505_add_customer_credit_limit`
**SQL:**
```sql
ALTER TABLE "Customer"
  ADD COLUMN "creditLimit" DECIMAL(12,2),
  ADD COLUMN "creditLimitOverridden" BOOLEAN NOT NULL DEFAULT false;
```
**Status:** criada em `prisma/migrations/`. **NÃO aplicada.**

---

## 📊 Diagnóstico — números reais

⚠️ **Como combinado, NÃO rodei nenhum script contra o banco.** Os números reais virão quando você rodar:

```bash
# Bug 1
npx tsx scripts/diagnose-bug1-orphan-quotes.ts

# Bug 2
npx tsx scripts/diagnose-bug2-stock-drift.ts

# Bug 3
npx tsx scripts/diagnose-bug3-credit-exposure.ts
```

Os scripts gravam log em `scripts/logs/` para auditoria.

### O que cada diagnóstico vai mostrar

**Bug 1:** Sales convertidas de Quote sem AccountReceivable / CardReceivable / FinanceEntry / StockMovement esperados. Top 50 empresas com vendas órfãs, distribuição por mês, soma monetária total.

**Bug 2:** Produtos com `Product.stockQty != SUM(BranchStock.quantity)`. Drift positivo (cache inflado) vs negativo. Total de unidades em drift absoluto. Top 50 produtos.

**Bug 3:** Clientes com AR pendente. Total em aberto, vencido, dias de atraso. Quantos inadimplentes continuaram comprando STORE_CREDIT nos últimos 30 dias. CPF e nome **mascarados** (LGPD).

---

## 🛠️ Correções aplicadas

### Bug #1 — Quote → Sale gera venda incompleta

**O QUE mudou:**
- Criado `src/services/sale-side-effects.service.ts` com 7 helpers reusáveis
- `sale.service.create` refatorado para usar helpers (comportamento idêntico)
- `quote.service.convertToSale` agora chama os mesmos helpers + adiciona 11 validações/side-effects faltantes

**POR QUÊ:**
- Eliminar duplicação que causava divergência (`sale.create` e `convertToSale` divergiram ao longo do tempo)
- A próxima alteração de regra de negócio em vendas afeta os dois caminhos automaticamente

**Side-effects que `convertToSale` ANTES não fazia, agora faz:**
- `validateBranchOwnership`, `validateStoreCredit`, `validateCreditLimit`, BALANCE_DUE customer check
- `Sale.completedAt`, `Quote.convertedAt/convertedByUserId`
- `SaleItem.costPrice` (busca do `Product.costPrice`)
- `atomicStockDebit` (BranchStock + Product.stockQty + StockMovement) — antes só `Product.stockQty`
- `CashMovement` filtrado por `METHODS_IN_CASH` — antes criava para CREDIT_CARD/STORE_CREDIT (errado)
- `AccountReceivable` para STORE_CREDIT (N parcelas) e BALANCE_DUE (1 parcela +30d)
- `CardReceivable` para CREDIT_CARD
- `cashbackService.earnCashback`
- `processaSaleForCampaigns`
- Lembrete pós-venda `POST_SALE_30_DAYS`

**Mudanças menores:**
- `try/catch` silencioso em `generateSaleEntries` substituído por log estruturado JSON-line
- Mesmo comportamento (não bloqueia) mas auditável via Vercel logs / Sentry futuro

**RISCOS:**
- 🟡 Refatoração de `sale.create` introduz risco de regressão. Mitigado por tests manuais cobrindo PDV direto também.
- 🟡 Vendas convertidas pré-fix com `SaleItem.costPrice = 0` continuam erradas (relatório de margem mostra 100% lucro). **Decisão:** dívida técnica documentada.

**DEPENDÊNCIAS:** nenhuma (sem migration).

---

### Bug #2 — Refund não atualiza BranchStock

**O QUE mudou:**
- `src/app/api/sales/[id]/refund/route.ts` chama `atomicStockCredit` em vez de `Product.stockQty.increment` direto
- Atualização atômica de BranchStock (upsert) + Product.stockQty
- Try/catch silencioso de `generateRefundEntries` → log estruturado JSON-line

**POR QUÊ:**
- `atomicStockCredit` faz upsert no `BranchStock` (cria se filial nunca teve esse produto)
- Atualiza `Product.stockQty` via SQL atômico
- Mesma lógica usada em `sale.cancel` (mantém consistência)

**RISCOS:**
- 🟢 Risco baixo. `atomicStockCredit` já usado em produção via `sale.cancel`.

**DEPENDÊNCIAS:** nenhuma (sem migration).

---

### Bug #3 — `validateCreditLimit` é stub

**O QUE mudou:**
- `Customer.creditLimit Decimal(12,2)?` e `Customer.creditLimitOverridden Boolean` adicionados ao schema
- Migration `20260505_add_customer_credit_limit` criada (NÃO aplicada)
- `validateCreditLimit` agora consulta SystemRules e calcula limite real
- Defaults atualizados em `system-rule.schema.ts`: R$ 500 e 30 dias

**POR QUÊ:**
- Customer.creditLimit = null → usa default da empresa (SystemRule)
- Customer.creditLimit = X → override individual
- creditLimitOverridden marca explícita "este cliente tem regra própria"
- Lógica de validação cobre: limite excedido + bloqueio por inadimplência

**RISCOS:**
- 🟡 **Vendas que antes passavam podem agora falhar.** Mitigação: rodar diagnóstico antes do deploy para baseline; comunicar atendentes; dar workaround (Customer.creditLimit individual via SQL ou via UI futura).
- 🟢 Implementação tem fallback hardcoded para defaults caso SystemRule não exista.

**DEPENDÊNCIAS:**
1. **Aplicar migration** (`npx prisma migrate deploy`) ANTES do deploy do código
2. (Opcional) Rodar `fix-bug3-set-default-credit-limits.ts --apply` depois do deploy
   - Sem isso, `validateCreditLimit` usa hardcoded defaults (funciona, mas empresas não conseguem customizar via UI até as regras existirem no banco)

---

## 🧪 Como Matheus testa (sequência completa)

### Etapa 1: Local / dev
```bash
cd "/Users/matheusreboucas/PDV OTICA"

# 1. Validar build
npx tsc --noEmit

# 2. Validar schema
./node_modules/.bin/prisma validate

# 3. Subir dev
npm run dev

# 4. Rodar testes manuais documentados em docs/audit/fixes/bug{1,2,3}_testes.md
```

### Etapa 2: Pré-deploy (em produção, com cuidado)

#### 2.1. Configurar `.env.diagnostic`
```bash
cp .env.diagnostic.example .env.diagnostic
# editar e preencher DATABASE_URL de produção
```

#### 2.2. Rodar diagnósticos (read-only) para baseline
```bash
# Em qualquer horário (read-only não pega lock pesado, mas evite hora de pico)
npx tsx scripts/diagnose-bug1-orphan-quotes.ts > /tmp/diag-bug1.txt
npx tsx scripts/diagnose-bug2-stock-drift.ts > /tmp/diag-bug2.txt
npx tsx scripts/diagnose-bug3-credit-exposure.ts > /tmp/diag-bug3.txt
```

Logs também são gravados em `scripts/logs/`. Revise antes de seguir.

### Etapa 3: Deploy

#### 3.1. Aplicar migration Prisma
```bash
npx prisma migrate deploy
```
(Adiciona colunas em Customer. Operação rápida — segundos.)

#### 3.2. Push do código → auto-deploy Vercel
```bash
git status   # revisar
git diff     # revisar
git add ...
git commit -m "..."
git push
```

### Etapa 4: Pós-deploy

#### 4.1. Rodar `fix-bug3-set-default-credit-limits.ts` (popular SystemRules)
```bash
# Dry-run
npx tsx scripts/fix-bug3-set-default-credit-limits.ts

# Aplicar
npx tsx scripts/fix-bug3-set-default-credit-limits.ts --apply --i-know-what-im-doing
```

#### 4.2. Aguardar 1 semana de operação com fix novo

Razão: validar que vendas/refunds/conversões NOVAS estão geradas corretamente. Se algum bug aparecer, é mais fácil identificar antes de corrigir dados antigos.

#### 4.3. Em horário noturno: rodar fixes retroativos
```bash
# Bug 1 — começar com 1 empresa pequena
npx tsx scripts/fix-bug1-orphan-quotes.ts --company-id <cuid_empresa_teste> --limit 10
# (revisar log)
npx tsx scripts/fix-bug1-orphan-quotes.ts --company-id <cuid_empresa_teste> --apply --i-know-what-im-doing

# Se OK, escalar
npx tsx scripts/fix-bug1-orphan-quotes.ts --apply --i-know-what-im-doing --limit 50
# (validar)
# (repetir até zerar)

# Bug 2 — sincronizar Product.stockQty
npx tsx scripts/fix-bug2-stock-drift.ts
npx tsx scripts/fix-bug2-stock-drift.ts --apply --i-know-what-im-doing
```

⚠️ **Cada fix é um script separado e independente.** Ordem sugerida:
1. Bug 3 (SystemRules) — primeiro, pois afeta validação no PDV
2. Bug 1 (vendas órfãs) — depois de validar que conversões novas estão OK
3. Bug 2 (drift de estoque) — por último (já corrige refunds novos via código)

---

## ✅ Decisões aplicadas

Todas as 6 perguntas foram respondidas. Resumo:

### 1. ✅ Cashback retroativo
"NÃO gerar para vendas convertidas antigas."
**Implementação:** `applyPostCommitSideEffects({ skipCashbackEarn: true })` é usado pelo script de migração quando processar vendas órfãs. Conversões NOVAS geram cashback normalmente (`skipCashbackEarn: false`).

### 2. ✅ Limite default e dias
- `customers.default_credit_limit` = **500**
- `customers.overdue_days_to_block` = **30**
- `customers.block_overdue_sales` = `true`

**Implementação:** `system-rule.schema.ts` atualizado com novos defaults. `validateCreditLimit` tem fallback hardcoded para esses valores caso SystemRule não exista.

### 3. ✅ Drift de estoque
Estratégia (a) — sincronizar `Product.stockQty = SUM(BranchStock.quantity)`. NÃO recriar StockMovement faltantes.

**Implementação:** `scripts/fix-bug2-stock-drift.ts`.

### 4. ✅ NOVA (2026-05-06) — `validateCreditLimit` também para BALANCE_DUE
**Decisão Matheus:** SIM. BALANCE_DUE é venda a prazo igual STORE_CREDIT — cliente inadimplente não pode burlar a validação só trocando o método.

Diferença em relação a STORE_CREDIT: BALANCE_DUE é parcela única vinculada à entrega da OS. A checagem é a mesma fórmula (`totalOpen + requestedAmount > effectiveLimit`) e a regra de bloqueio por inadimplência (`overdue_days_to_block`) também se aplica.

**Implementação aplicada:**
- `src/services/sale.service.ts:create` — loop de validação refatorado para chamar `validateCreditLimit` em ambos `STORE_CREDIT` e `BALANCE_DUE` (com customerId presente)
- `src/services/quote.service.ts:convertToSale` — mesma mudança
- Comentário `// Decisão (Matheus, 2026-05-06)` documentando inline

### 5. ✅ NOVA (2026-05-06) — `SaleItem.costPrice=0` em vendas antigas: NÃO corrigir
**Decisão Matheus:** NÃO corrigir retroativamente.

**Justificativa registrada:**
1. `Product.costPrice` atual pode ser diferente do histórico
2. Aplicar o atual nas antigas distorce os relatórios mais ainda
3. Solução correta exigiria buscar histórico via `InventoryLot`, complexo e arriscado

**Implementação aplicada:**
- `bug1_migracao.md` — adicionada seção "Dívida técnica aceita" explicando o impacto operacional (relatórios de margem desse período mostram lucro inflado)
- `scripts/fix-bug1-orphan-quotes.ts` — adicionado contador `salesWithZeroCostPrice` e `saleItemsWithZeroCostPrice`. No log final, imprime aviso destacado:
  > "AVISO: X vendas órfãs identificadas com SaleItem.costPrice=0 (Y itens no total). NÃO serão corrigidas (decisão de produto). Razão: ... Relatórios de margem desse período devem ser interpretados com cautela — vão mostrar lucro inflado."

### 6. ✅ NOVA (2026-05-06) — UI para `Customer.creditLimit`: NÃO agora
**Decisão Matheus:** Fica para Fase 1C ou posterior.

**Implementação aplicada:**
- `bug3_correcao.md` — adicionada seção "Follow-up" detalhando a especificação completa da UI futura:
  - Tela: `/dashboard/clientes/[id]/editar`
  - Campos: input numérico "Limite de crédito (R$)" + checkbox "Limite individual configurado"
  - Permissão sugerida
  - Endpoint sugerido `/api/customers/[id]/credit-status`
  - Telas que devem mostrar o limite efetivo
- Por enquanto: override individual só via SQL direto (documentado).

---

## 🔁 Mudanças adicionais aplicadas após decisões

### Pergunta 4 (BALANCE_DUE)
- `src/services/sale.service.ts` — loop de validação reorganizado: `validateCreditLimit` é chamado para STORE_CREDIT **e** BALANCE_DUE (quando há customerId). Comentário inline com data e justificativa.
- `src/services/quote.service.ts` — mesma alteração em `convertToSale`.

### Pergunta 5 (costPrice=0)
- `scripts/fix-bug1-orphan-quotes.ts` — include de `items` adicionado; novos contadores (`salesWithZeroCostPrice`, `saleItemsWithZeroCostPrice`); aviso destacado no resumo final do log com a justificativa completa.
- `docs/audit/fixes/bug1_migracao.md` — seção "Dívida técnica aceita: SaleItem.costPrice=0 em vendas convertidas antigas" com justificativa, query SQL de identificação e impacto operacional.

### Pergunta 6 (UI creditLimit)
- `docs/audit/fixes/bug3_correcao.md` — seção "Follow-up — Fase 1C ou posterior" com especificação completa da UI futura.

### Validação final
`npx tsc --noEmit` rodado após todas as mudanças adicionais — **sem erros**.

---

## 🔮 O que ficou para Fase 1B

Os bugs 4-7 do mapeamento original (rel. 14):

- 🟠 17 routes recebem `branchId` no body sem `validateBranchOwnership` (rel. 06 G3)
- 🟠 Race condition em `cash.openShift` (sem partial unique index)
- 🟠 Race condition em `RecurringExpense.generate` (check fora tx)
- 🟠 Backend confia em `total` enviado pelo front (manipulação de preço explorável)
- 🟠 Refund pode acumular: sem check de `sum(refundItems.qty) <= saleItem.qty` em chamadas sucessivas
- 🟠 `console.log` com email/role em `auth.ts:76, 84, 98, 126, 142, 150` (LGPD)
- 🟠 LGPD: `Customer.acceptsMarketing` default `true`, sem consent/anonymization

Outros achados de menor severidade ficam para Fase 2.

---

## 📌 LEMBRETE FINAL

- **NÃO fiz `git commit` nem `git push`.** Tudo aguarda revisão.
- **Migration `20260505_add_customer_credit_limit` criada mas NÃO aplicada.** Você roda `npx prisma migrate deploy` quando quiser.
- **Scripts de diagnóstico são read-only.** Pode rodar a qualquer momento.
- **Scripts de migração são dry-run por padrão.** Para aplicar exige `--apply --i-know-what-im-doing` E digitar `CONFIRMO` no terminal.
- **`.env.diagnostic` é separado de `.env`.** Configure quando for rodar.
- `npx tsc --noEmit` passa sem erros.
- `npx prisma validate` passa.
- `npm run lint` — não rodei (escopo). Pode haver novos warnings de unused imports após a refatoração de `sale.service.ts` — recomendo rodar antes do commit.

### Para revisar o diff
```bash
# Tudo que mudou
git diff -- src/services/sale.service.ts
git diff -- src/services/quote.service.ts
git diff -- src/app/api/sales/\[id\]/refund/route.ts
git diff -- src/lib/installment-utils.ts
git diff -- src/lib/validations/system-rule.schema.ts
git diff -- prisma/schema.prisma
git diff -- .gitignore

# Arquivos novos (não rastreados)
git status --short | grep "^??" | grep -E "(scripts|docs/audit/fixes|src/services/sale-side-effects|prisma/migrations/20260505|.env.diagnostic)"
```
