# Sprint Q8 — Pronto pra Vender

**Data:** 2026-05-27
**Autor:** brainstorming session (Claude + Matheus)
**Status:** Design — aguardando aprovação
**Spec anterior:** [2026-05-27-sprint-Q7-backlog-design.md](./2026-05-27-sprint-Q7-backlog-design.md) (parcialmente entregue)
**Reviewer:** spec-document-reviewer (1 iteração, 3 BLOCKERS + 5 HIGH corrigidos em 2026-05-27)

---

## ⚠️ Estado já existente (confirmado em 2026-05-27)

Antes de propor mudanças, este spec **explicitamente reconhece** o que já foi implementado:

| Item | Status atual | Localização |
|---|---|---|
| `FinanceEntryRetry` model | ✅ Existe | `prisma/schema.prisma:2831`, enum `FinanceEntryRetryStatus:2850` (PENDING, SUCCESS, FAILED, ABANDONED) |
| Migration `add_finance_entry_retry` | ✅ Aplicada | `prisma/migrations/20260527160000_add_finance_entry_retry/` |
| Cron `/api/cron/retry-finance-entries` | ✅ Existe | Schedule `*/15 * * * *` em `vercel.json` |
| Cron `/api/cron/dunning` | ✅ Existe | Schedule `0 8 * * *` em `vercel.json` |
| `BillingEvent` com `retryCount` | ✅ Existe | `prisma/schema.prisma:2128` |
| `AdminUser` model | ✅ Existe | `prisma/schema.prisma:2180` |
| Pacote `qrcode` | ✅ Instalado | `package.json:79` (`^1.5.4`) |
| Pacote `speakeasy` (TOTP) | ❌ Não instalado | Precisa `npm i speakeasy @types/speakeasy` |
| `src/middleware.ts` raiz Next.js | ❌ Não existe | Apenas `src/middleware/require-permission.ts` (helper, não Next middleware) |
| `prisma/migrations/migration_lock.toml` | ❌ Faltando | Confirma drift estrutural |
| `BillingEvent.lastErrorAt` | ❓ Verificar antes de migration | Q8.1.2 pode precisar adicionar — grep schema + migrations antes de escrever |

**Implicação operacional:** os 2 slots de Vercel Cron grátis estão **ocupados**. Adicionar mais crons exige consolidação OU upgrade.

---

## TL;DR

Sprint Q8 estabiliza o PDV ÓTICA ao ponto de **poder ser vendido como SaaS** sem perder receita por inadimplência, vazar dados financeiros ou expor a área administrativa. Foco em 4 pilares: **receita garantida**, **integridade financeira**, **segurança admin**, **schema confiável**. UX polish foi recortado pro Q9.

**Estimativa:** 40-58h (5-8 dias de execução focada — revisada após reviewer feedback: +1h Q8.4.0 drift confirm, +1h Q8.2.5 lock, +0-6h Q8.4.3 escopo realista, -2h Q8.1.2/Q8.2.2 reuso de infra existente).
**Critério de fechamento:** 10 checkpoints binários (ver §10).

---

## 1. Contexto e Motivação

### Estado atual (validado em 2026-05-27 por 4 agentes paralelos)

**O que Q7 entregou** (13 de 18 itens P0/P1 do audit corrigidos):
- HMAC Asaas timing-safe (P1-7)
- Cross-tenant fixes em CRM, lens-treatments, sales/cashback, users/permissions (P0-3, P0-4, P1-1, P1-2)
- Cashback race fixado com `updateMany` atômico (P1-5)
- CashShift uniqueness via DB index (P0-8 parcial)
- bcrypt dummy em auth (P1-9)
- HMAC webhook (P1-7)
- `inventory_lots` com guard de plano (P0-1)
- `cashDate` cartão e `balance` CARD_ACQUIRER corrigidos (P0-6, P0-7)

**O que ficou em aberto / parcial:**
- P0-5: estorno AR não cria FinanceEntry compensatório → ghost cash
- P0-8: cashshift close sem app-level lock (só DB-level)
- P1-3: rate-limit ainda in-memory (Vercel cold start reseta) — vai pra Q9 (precisa infra Redis)
- P1-4: register route sem rate limit
- P1-10: `generateSaleEntries` silent fail sem retry table

**Blockers REAIS pra vender SaaS** (não estavam no Q7, descobertos agora):
1. **Inadimplência não bloqueia acesso** — webhook marca PAST_DUE mas middleware não checa
2. **Admin sem MFA** — 1 senha comprometida = acesso a todos os tenants via impersonate
3. **33/35 APIs admin sem rate limit** — `/api/admin/clientes/[id]/actions` aberta pra abuso
4. **Webhook Asaas sem retry** — fatura órfã se 1ª tentativa falhar
5. **Checkout não-idempotente** — Asaas pode criar duplicata em retry

**Riscos de schema:**
- 14+ campos Company sem migration (prod depende de `prisma db push`)
- `User.email` @unique global — IDOR via enumeration
- `Sale.fiscalRef` @unique global — reprocessamento NF quebra
- 6 modelos com `deletedAt` ignorado nas queries

**Riscos no fluxo de venda:**
- Timeout P2028 em `applyFinanceEntriesInTx` — venda completa sem DRE
- `generateSaleEntries` silent fail sem retry
- POST `/api/sales` sem idempotency — duplo-clique cria venda dupla

---

## 2. Critério de "Pronto pra Vender" (definição operacional)

1. **Receita garantida**: cliente que para de pagar perde acesso automaticamente em ≤1h. Webhook Asaas é confiável (retry + idempotência).
2. **Sem ghost data**: toda venda gera FinanceEntry; todo estorno reverte caixa+DRE; toda dedução de cashback é atômica.
3. **Sem buraco de segurança crítico**: zero IDOR cross-tenant, admin com MFA, rate limit em todas APIs admin.
4. **Schema confiável**: migrations alinhadas com prod, CI bloqueia drift, baseline migration gerada.
5. **Fluxos de venda críticos funcionam end-to-end**: criar venda à vista, criar venda parcelada, receber parcela — todos cobertos por E2E.

**Fora do escopo (vai pra Q9):**
- Features novas (Focus NFe, etc.)
- Refactor de `prisma-tenant.ts` (dead code)
- Migração rate-limit para Redis/Upstash
- Smoke das 50 páginas + design audit completo
- Revisão UX de erros de forms em PT-BR

---

## 3. Decisões travadas (não negociáveis sem novo discusso)

| # | Decisão | Valor | Razão |
|---|---|---|---|
| D1 | Grace period PAST_DUE | **3 dias** | Padrão SaaS BR, tempo pra pagar boleto atrasado |
| D2 | Cron runner | **Vercel Cron gratuito — consolidar em super-cron** | Os 2 slots já estão ocupados (dunning + retry-finance-entries). Solução: consolidar tudo em 1 cron `*/5 * * * *` que despacha sub-tasks. Ver §4.5. |
| D3 | Email provider | **Resend** | 3000/mês grátis, API simples |
| D4 | Deploy migrations | **CI automático** | `prisma migrate deploy` no build Vercel |
| D5 | Observabilidade | **Sentry ativo + alertas básicos** | Bridge existe (Q5). Setar DSN (5min) + configurar 3 alertas (webhook fail, retry > 3, 500s em endpoints críticos — 1h total). Não é "só setar DSN". |

---

## 4. Arquitetura (visão alto-nível)

### Receita Garantida

```
[Tenant ação] → middleware checkSubscription()
                  ├─ company.isBlocked → 403
                  ├─ subscription.status === ACTIVE → next()
                  ├─ subscription.status === PAST_DUE
                  │    ├─ daysSinceOverdue ≤ 3 → next() + warning banner
                  │    └─ daysSinceOverdue > 3 → redirect /assinatura/pagar
                  └─ subscription.status === SUSPENDED → redirect /assinatura/pagar
```

```
[Webhook Asaas] → POST /api/webhooks/asaas
                    ├─ verify HMAC (já existe)
                    ├─ dedup via externalEventId (já existe)
                    ├─ try processEvent()
                    │    ├─ success → mark processedAt
                    │    └─ fail → increment retryCount, schedule retry
                    │             (usa BillingEvent.retryCount existente, NÃO criar novo campo)
                    │
[Super-cron 5min] → POST /api/cron/tick (consolidado)
                    ├─ subtask: retry-webhooks → BillingEvent WHERE processedAt=null AND retryCount<5
                    ├─ subtask: retry-finance-entries → reaproveita lógica existente
                    ├─ subtask: dunning → reaproveita lógica existente (mas só roda 1x/dia via check de timestamp)
                    └─ subtask: suspension-sweep → tenants PAST_DUE>3d marca SUSPENDED
```

### Integridade Financeira

```
[Estorno AR] → POST /api/accounts-receivable/[id]/reverse
                ├─ tx.start
                ├─ update AR status = PENDING
                ├─ if originalCashMovement exists:
                │   ├─ shift.status === OPEN → create CashMovement REFUND OUT
                │   └─ shift.status === CLOSED → create CashMovement em shift OPEN do dia
                ├─ create FinanceEntry compensatório (sourceType=AR_REVERSAL)
                └─ tx.commit
```

```
[Venda finaliza] → sale.service.create()
                    ├─ tx.start (timeout 30s)
                    ├─ ... (existente)
                    └─ try applyFinanceEntriesInTx()
                         ├─ success → done
                         └─ fail → criar FinanceEntryRetry { saleId, error, retryAt }
                                   (não bloqueia venda, mas é rastreável)

[Cron 5min] → POST /api/cron/retry-finance-entries
              ├─ find FinanceEntryRetry WHERE processedAt = null AND attempts < 5
              └─ retry generateSaleEntries; mark processedAt or increment attempts
```

### Segurança Admin

```
[Admin login] → POST /api/admin/auth/login
                  ├─ rate limit 5/15min (já existe)
                  ├─ bcrypt verify
                  ├─ if !adminUser.mfaEnabled → force enrollment screen
                  ├─ if adminUser.mfaEnabled → require totpCode in body
                  │    ├─ verify via speakeasy
                  │    └─ create session 8h
                  └─ log to GlobalAudit (success/fail)
```

### Schema

```
prisma/migrations/
  migration_lock.toml                                  ← CRIAR (faltando hoje, confirma drift)
  20260528_baseline_drift_recovery/                    ← NOVO (após migrate diff revelar gap real)
    migration.sql                                      ← APENAS colunas confirmadas faltantes em prod, com IF NOT EXISTS
  20260528_unique_constraints_fixes/                   ← NOVO (após pré-check de duplicatas)
    migration.sql                                      ← User.email, Sale.fiscalRef, AP composite
```

```
.github/workflows/check-drift.yml                      ← NOVO
  - run: npx prisma migrate diff --exit-code \
           --from-migrations ./prisma/migrations \
           --to-schema-datamodel ./prisma/schema.prisma
  - fail (exit 2) se drift detectado
```

### 4.5 Super-cron architecture

Os 2 slots Vercel Cron grátis estão ocupados (`dunning` diário + `retry-finance-entries` 15min). Em vez de adicionar/upgrade, consolidamos:

```
vercel.json (após Q8):
{
  "crons": [
    { "path": "/api/cron/tick", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/dunning", "schedule": "0 8 * * *" }   // mantido (negócio diferente)
  ]
}
```

`/api/cron/tick` despacha sub-tasks em paralelo via `Promise.allSettled`:
- `retryWebhooks()` — processa BillingEvent com `retryCount < 5 AND processedAt = null`
- `retryFinanceEntries()` — chama a função existente que `/api/cron/retry-finance-entries` já chama
- `suspensionSweep()` — marca tenants PAST_DUE > 3d como SUSPENDED

Cada sub-task tem timeout próprio (15s default) e isolamento de erro. Falha em uma não bloqueia as outras. Tick total max 60s (limite Vercel Hobby).

**Migração:** `vercel.json` deleta a entrada antiga `retry-finance-entries`. Pasta `src/app/api/cron/retry-finance-entries/` continua existindo (rota acessível manualmente para debug + chamada de dentro do tick).

---

## 5. Fases de execução

### Q8.0 — Pré-flight (1-2h)
- Validar deploys Q7 em prod (comparar `git log` vs Vercel deployments)
- Backup manual do Neon (você executa, eu te dou comando)
- Rodar `npm test` e capturar baseline em `qa-artifacts/Q8-baseline/`
- Listar env vars necessárias em `.env.example`

**Critério feito:** `qa-artifacts/Q8-baseline/README.md` com snapshot de testes, deploys, env vars necessárias.

### Q8.0.5 — Auditoria dos dados de prod (1-2h) ← DECISIVO
- Script `scripts/audit-q8-data.ts` mede:
  - Vendas COMPLETED sem FinanceEntry (count + % do total)
  - AR pagas sem CashMovement correspondente (count + % do total)
  - Duplicatas de email entre tenants (lista)
  - Webhooks Asaas órfãos (BillingEvent com processedAt = null e retryCount > 0)
  - Tenants em PAST_DUE há > 30 dias ainda ativos (count + MRR estimado perdido)
- Output: `qa-artifacts/Q8-data-audit.md`

**Checkpoint contigo:** se qualquer métrica passar dos limites abaixo, pausamos e entramos em Q8.0.6:
- Vendas COMPLETED sem FinanceEntry > **0.5%** OU > 50 vendas absoluto
- AR pagas sem CashMovement > **0.5%** OU > 20 registros
- Duplicatas de email cross-tenant > **0** (bloqueia Q8.4.2)
- Webhooks órfãos > **10** absoluto

### Q8.0.6 — Data cleanup (condicional, 2-8h) — só se Q8.0.5 acionar
- Script `scripts/cleanup-q8-data.ts` (dry-run primeiro, sempre)
- Para vendas sem FinanceEntry: tentar gerar via `generateSaleEntries` retroativo (modo idempotente)
- Para AR sem CashMovement: criar CashMovement em shift de ajuste rotulado
- Para email duplicados: relatório, você decide caso a caso (merge accounts não é automatizável)
- Para webhooks órfãos: marcar como ABANDONED + log, intervenção manual no Asaas dashboard
- Output: `qa-artifacts/Q8-cleanup-report.md`

### Q8.1 — Receita Garantida (8-12h)

**Q8.1.1 — Suspensão automática por inadimplência**
- Criar `src/middleware.ts` (raiz Next.js — não existe hoje) OU adicionar gate em `src/app/(dashboard)/layout.tsx` (server component)
- Helper `src/lib/subscription-gate.ts` (função pura, testável) que lê `subscription.status` + `daysSinceOverdue` e retorna `{ allow: boolean, redirect?: string, reason?: string }`
- Bloqueia se `PAST_DUE > 3d` ou `SUSPENDED` ou `isBlocked`
- Permite sempre: rota `/assinatura/pagar`, `/api/billing/*`, `/api/webhooks/*`, `/api/auth/*`, `/admin/*`
- Feature flag `ENFORCE_SUSPENSION` (default `false` até validar 48h em staging)
- Whitelist via env `SUBSCRIPTION_BYPASS_COMPANY_IDS` (CSV de IDs, você + betas)
- Decisão de implementação: server component em layout (não middleware Next.js) — mais simples, testável, e middleware Next em Vercel tem cold start próprio. Middleware fica como alternativa documentada.
- TDD: 12 cenários (ACTIVE, TRIAL, PAST_DUE-2d, PAST_DUE-3d, PAST_DUE-7d, SUSPENDED, CANCELED, isBlocked, accessEnabled override, whitelist, sem subscription, expired trial)

**Q8.1.2 — Webhook Asaas com retry (REUSO de infra existente)**
- ⚠️ **Não criar campos novos.** `BillingEvent.retryCount` já existe. Usar.
- Estender handler em `src/app/api/webhooks/asaas/route.ts`: ao falhar processamento, incrementar `retryCount` (já no schema) e deixar `processedAt = null`
- Adicionar sub-task `retryWebhooks()` ao super-cron `/api/cron/tick` (ver §4.5)
- Reprocessa `WHERE processedAt = null AND retryCount < 5`
- Sentry alert quando `retryCount === 3`
- Dead letter: `retryCount === 5` → admin notificado via novo email transacional + `BillingEvent.lastErrorAt` (campo a adicionar se não existir — checar com `grep` antes)

**Q8.1.3 — Checkout idempotente**
- `Subscription.idempotencyKey` @unique
- Client gera UUID v4, envia em header `Idempotency-Key`
- Server: se key existe → retorna subscription existente (idempotent)
- Migration adiciona campo (nullable, sem default)

**Q8.1.4 — Notificação email PAST_DUE**
- Setup Resend (env `RESEND_API_KEY`)
- Template simples em `src/lib/emails/past-due.tsx` (React Email)
- Trigger no webhook ao receber PAYMENT_OVERDUE: agendar email após D+1, D+2, D+3
- Template inclui: valor, vencimento, link pagamento Asaas, dias restantes até bloqueio

**Critério feito:**
- Simular tenant inadimplente via webhook fake → acesso bloqueia em ≤1h
- Simular webhook duplicado → não cria invoice duplicada
- Email PAST_DUE chega na inbox de teste

### Q8.4 — Schema & Migrations (4-6h) — paralelo com Q8.1

**Q8.4.0 — Pré-requisito (NOVO): confirmar drift real**
- Criar `prisma/migrations/migration_lock.toml` com `provider = "postgresql"`
- Rodar `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script > /tmp/local-drift.sql`
- Conectar ao Neon (você reativa se idle): `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel ./prisma/schema.prisma --script > /tmp/prod-drift.sql`
- Diff `local-drift.sql` vs `prod-drift.sql` → revela gap REAL entre migrations versionadas, schema declarado, e DB de prod
- Output: `qa-artifacts/Q8-schema-drift.md` com lista exata de campos que precisam migration
- **Sem este passo, não escrever Q8.4.1.**

**Q8.4.1 — Baseline migration (evidence-based)**
- `prisma/migrations/20260528_baseline_drift_recovery/migration.sql`
- Apenas colunas confirmadas faltantes em Q8.4.0
- ALTER TABLE com `IF NOT EXISTS` em cada coluna (safety net)
- Pre-flight: testar em branch Neon (cópia de prod via Neon branching, custo zero)

**Q8.4.2 — Constraints corretas (com audit de callsites)**
- Pré-verificação 1: `scripts/check-duplicate-emails.ts` lista User com mesmo email em companyIds diferentes
- Pré-verificação 2: `scripts/check-duplicate-fiscalrefs.ts` lista Sale com mesmo fiscalRef cross-tenant
- Pré-verificação 3: `scripts/check-duplicate-invoicenumbers.ts` lista AccountPayable colisões
- Se zero duplicatas em cada → migration: composite unique
- Se houver → relatório, você decide (merge/renomear/skip)
- ⚠️ **Audit de callsites obrigatório**: agente lista todos `findUnique({ where: { email } })`, `findUnique({ where: { fiscalRef } })`, `findUnique({ where: { invoiceNumber } })` no codebase. Cada um precisa virar `findFirst({ where: { companyId, email } })` ou usar a nova chave composta.
- Migration sai junto com o codemod no mesmo PR (atomicidade)

**Q8.4.3 — Soft-delete middleware (escopo realista)**
- Promover de sub-task para FASE PRÓPRIA: estimativa real 8-12h
- `src/lib/prisma-soft-delete.ts` — Prisma client extension via `$extends`
- Aplica `WHERE deletedAt IS NULL` em 6 models: Customer, Product, Sale, Quote, ServiceOrder, ProductCampaign
- ⚠️ **Limitação conhecida**: Prisma extensions NÃO interceptam relações aninhadas (`include`/`select`). Deletados aparecem via include. Documentar em `docs/SOFT_DELETE_LIMITATIONS.md` + lista de includes problemáticos.
- Bypass via método custom: `prisma.customer.findManyWithDeleted({ where })`
- Audit obrigatório dos ~200 callsites: agente categoriza (espera deletado / não espera / não importa)
- Migração progressiva: aplicar extension somente após audit + revisão dos callsites críticos
- **Se audit revelar > 50 callsites complexos → mover Q8.4.3 inteira para Q9.** Não é blocker de venda.

**Q8.4.4 — CI bloqueia drift**
- `.github/workflows/check-drift.yml`
- Step: `npx prisma migrate diff --exit-code --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma`
- Exit code 2 = drift detectado → fail PR
- Documento `CONTRIBUTING.md` com workflow: dev edita schema → `npx prisma migrate dev --name <desc>` → commit migration junto

**Critério feito:** `prisma migrate diff --from-url $STAGING_URL --to-schema-datamodel` retorna "No difference detected" (exit 0). CI bloqueia drift futuro.

### Q8.2 — Integridade Financeira (12-16h) — solo (mexe em finance)

**Q8.2.1 — Estorno AR cria FinanceEntry compensatório**
- Modificar `src/app/api/accounts-receivable/route.ts` (action=reverse)
- Lógica:
  - Se shift original OPEN → CashMovement REFUND OUT no shift original
  - Se shift original CLOSED → CashMovement no shift OPEN atual do mesmo dia
  - Se sem shift OPEN no dia → criar shift de ajuste com tag `adjustment=true`
  - Sempre criar FinanceEntry com `sourceType=AR_REVERSAL`, `side=DEBIT`
- TDD: 8 cenários (shift aberto, fechado mesmo dia, fechado outro dia, sem shift, valor parcial, multi-parcela, com juros, com cashback usado)

**Q8.2.2 — FinanceEntryRetry: AUDITAR + COMPLETAR integração existente**
- ⚠️ **Não criar tabela.** `FinanceEntryRetry` já existe (`schema.prisma:2831`) com schema: `id, saleId, companyId, attempt, status (PENDING/SUCCESS/FAILED/ABANDONED), nextRetryAt, lastError, succeededAt, @@unique([saleId])`.
- ⚠️ **Não criar cron.** Cron `/api/cron/retry-finance-entries` já existe (`*/15` em `vercel.json`).
- Verificar:
  1. `sale-side-effects.service.ts:applyFinanceEntriesInTx` REALMENTE insere FinanceEntryRetry no catch? (audit anterior P1-10 diz "silent fail sem retry table" — confirmar se Q7 fechou isso)
  2. Cron handler atual reprocessa corretamente?
  3. Status `ABANDONED` é setado em `attempt === 5`?
  4. Sentry alert em `attempt === 3`?
- Gaps identificados na auditoria → corrigir
- Integrar ao super-cron (§4.5): mover lógica de `retry-finance-entries/route.ts` para função reutilizável, chamada do tick + da rota legada (backward-compat)
- Frequência: passa de 15min → 5min (via super-cron)

**Q8.2.3 — Idempotency em POST /api/sales**
- Header `Idempotency-Key` opcional (UUID v4 esperado, max 100 chars)
- Nova tabela `SaleIdempotency { key @unique, companyId, saleId, payloadHash, createdAt, expiresAt }`
- `@@unique([companyId, key])` — colisão entre tenants impossível
- `payloadHash`: SHA-256 hex de `JSON.stringify(canonicalize(payload))` onde `canonicalize` ordena chaves alfabeticamente, normaliza Decimals para string, e exclui campos voláteis (`createdAt`, `requestId`)
- Lógica server:
  - Se header presente + lookup hit + payloadHash match → retorna sale existente (idempotent)
  - Se hit + payloadHash diferge → 422 `IDEMPOTENCY_KEY_CONFLICT`
  - Se miss → processa normal + INSERT idempotency record com `expiresAt = now + 24h`
- TTL/limpeza: cron diário (parte do dunning ou tick) deleta records `expiresAt < now`
- Sem header: comportamento atual (backward-compatible)
- Bibliotecas: `node:crypto` (built-in) — não adicionar deps

**Q8.2.4 — Script de auditoria histórica**
- `scripts/audit-finance-consistency.ts`
- Verifica:
  - Vendas COMPLETED sem FinanceEntry → lista IDs + valor
  - AR RECEIVED sem CashMovement → lista IDs + valor
  - CashMovement IN sem AR correspondente → lista
  - FinanceAccount.balance vs SUM(FinanceEntry) → diff por conta
- Output: `qa-artifacts/Q8-finance-audit.md` com lista priorizada

**Critério feito:** script roda em prod → 0 inconsistências OU lista priorizada com plano de fix manual aprovado.

### Q8.2.5 — Cash shift close com lock (fechar P0-8 do audit anterior)
- 30-60min
- Modificar `src/services/cash.service.ts:closeShift()` para usar transação com `SELECT ... FOR UPDATE` no CashShift
- Garante: 2 requests paralelos pra fechar mesmo shift → 1 ganha, outro recebe 409
- TDD: 2 testes paralelos via `Promise.all` simulam race
- Critério: teste com 10 closes paralelos → exatamente 1 sucesso, 9 conflitos

### Q8.3 — Segurança Admin SaaS (6-8h) — solo (mexe em auth)

**Q8.3.1 — MFA admin (TOTP)**
- Schema: `AdminUser.mfaSecret`, `AdminUser.mfaEnabled`, `AdminUser.mfaBackupCodes` (string[])
- Dependências: `speakeasy` (TOTP), `qrcode` (já no package)
- Fluxo:
  - Login bem-sucedido + `mfaEnabled === false` → force enrollment screen
  - Enrollment gera secret + QR code + 10 backup codes (single-use)
  - Login + `mfaEnabled === true` → exigir `totpCode` no body
  - Backup code consumido → marca como used
- Env var `ADMIN_MFA_REQUIRED` (default false até admin enrollar)
- Env var `ADMIN_MFA_BYPASS_EMAIL` (escape hatch para você, loga em audit)

**Q8.3.2 — Rate limit em todas APIs admin**
- Middleware `src/middleware/admin-rate-limit.ts`
- Aplica em `/api/admin/*` exceto `/api/admin/auth/login` (já tem)
- Default: GET 60/min, POST/PATCH/DELETE 10/min
- Configurável por rota via constante
- Whitelist IP via env `ADMIN_RATE_LIMIT_BYPASS_IPS`

**Q8.3.3 — Impersonation: 1 sessão ativa por admin**
- Schema: `AdminSession.revokedAt`
- Ao criar nova impersonation: marca todas as anteriores do mesmo admin como `revokedAt = now`
- Middleware checa `revokedAt` antes de aceitar token

**Q8.3.4 — Audit log expandido**
- Logar em `GlobalAudit`:
  - Login attempts (success + fail) com IP + userAgent
  - Permission denials
  - Exports em massa (action=EXPORT, count > 100)
  - Mass actions (delete, block, change_plan)
- Retenção: 90 dias para login attempts, 1 ano para mutations

**Critério feito:** pentest interno (agente security-reviewer):
- Tenta logar admin sem MFA → falha
- Spam em /actions → bloqueado por rate limit
- Cria 100 impersonate tokens do mesmo admin → só 1 ativo

### Q8.5 — Smoke E2E mínimo (3-4h) — recortado

**Q8.5.1 — E2E Playwright dos 3 fluxos críticos**
- `e2e/critical-flows.spec.ts`
- Fluxos:
  1. Cadastro novo tenant → checkout → login → criar venda à vista → ver no caixa
  2. Login existente → criar venda parcelada STORE_CREDIT 3x → fechar caixa
  3. Login existente → receber parcela 1 do crediário → ver DRE
- Roda em CI a cada PR
- Captura screenshots em cada step

**Q8.5.2 — Smoke automatizado de 10 páginas mais usadas**
- `e2e/smoke-top-pages.spec.ts`
- Páginas: dashboard, pdv, caixa, clientes, produtos, financeiro/dre, financeiro/contas-receber, ordens-servico, vendas, estoque
- Verifica: carrega sem JS error, sem React error boundary, render < 5s
- Roda em CI a cada PR

**Q8.5.3 — Sentry ativo**
- Setar `SENTRY_DSN` em Vercel env (você cria projeto Sentry, me dá DSN)
- Validar que erros server + client chegam no dashboard
- Configurar alertas para: webhook failures, FinanceEntryRetry attempts > 3, 500s em endpoints críticos

**Critério feito:** E2E suite verde em CI. Sentry recebe erro de teste.

### Q8.99 — Wrap-up (2h)

- Atualizar `CHANGELOG.md`
- Atualizar `BLUEPRINT_FUNCIONAL_PDV.md` com novos fluxos
- `docs/Q8-retro.md` — lessons learned
- Checklist de produção rodado (`ship` skill)
- Comunicado opcional pra você usar com clientes/comerciais

---

## 6. Skills + agentes utilizados

| Fase | Skills | Agentes paralelos | Agentes sequenciais |
|---|---|---|---|
| Q8.0 | careful, gsd:health | 0 | 0 |
| Q8.0.5 | iterative-retrieval | 1 (general-purpose escreve script) | 0 |
| Q8.1 | test-driven-development, vercel:vercel-functions, verification-loop, vercel:knowledge-update | 0 | 4 (general, tdd-guide, code-reviewer, security-reviewer) |
| Q8.4 | careful, database-reviewer, gsd:health | 0 | 4 (database-reviewer, general, code-reviewer, general) |
| Q8.2 | careful, freeze, systematic-debugging, database-reviewer | 4 (general, tdd-guide, database-reviewer, code-reviewer) | 0 |
| Q8.3 | security, security-review, vercel:auth, test-driven-development | 3 (security-reviewer, general, tdd-guide) | 0 |
| Q8.5 | e2e-testing, qa, gstack, verify | 2 (e2e-runner, general) | 0 |
| Q8.99 | document-release, update-docs, ship, learn | 0 | 0 |

**Total ~18 agentes** ao longo do sprint.

---

## 7. Quem faz o quê

### Eu (Claude) faço sozinho
- Todo código, testes, migrations, scripts, E2E
- Rodar `npm test`, `npm run build`, `npm run lint`
- Commits + push (direto na main como você já faz)
- Documentação (spec, CHANGELOG, retro)
- Smoke E2E em browser headless
- Pentest interno via security-reviewer

### Você faz (estimado ~2-3h totais)
- Criar conta Asaas sandbox + setar `ASAAS_API_KEY` no Vercel (se ainda não tem)
- Criar conta Resend + setar `RESEND_API_KEY` no Vercel
- Criar projeto Sentry + setar `SENTRY_DSN` no Vercel
- Backup manual do Neon antes de migration (1 clique)
- Enrollar seu TOTP no /admin (1 vez, após Q8.3.1)
- Aprovar spec (agora) + revisar checkpoint após Q8.0.5
- Decisões pontuais (cleanup de dados se Q8.0.5 revelar muita coisa)

---

## 8. Riscos + mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Middleware suspensão bloqueia tenant pagante por bug | Média | Alto | Feature flag `ENFORCE_SUSPENSION=false` no início, whitelist, 48h staging |
| Webhook retry cria invoice duplicada | Média | Alto | Idempotência via `externalEventId`, lock pessimista no event |
| Cron Vercel falha em silêncio | Média | Médio | Cada execução loga em Sentry, healthcheck endpoint |
| Idempotency key colide entre tenants | Baixa | Médio | Key composta com `companyId` no hash |
| Script auditoria revela 1000+ inconsistências | Alta | Médio | Lista priorizada, você decide cleanup/aceitar/migrar |
| FinanceEntry compensatório gera lançamento errado | Baixa | Alto | TDD com 8 cenários antes de tocar código |
| MFA roll-out trava admin fora | Baixa | Catastrófico | Backup codes + env var `ADMIN_MFA_BYPASS_EMAIL` |
| `User.email` unique viola duplicatas existentes | Média | Alto | Script pré-verificação, migration só após zero duplicatas |
| Soft-delete middleware quebra query que esperava deletados | Média | Médio | Bypass via `findManyWithDeleted`, auditoria 200+ callsites |
| Conversa Claude estoura contexto | - | - | Cada fase = sessão separada via `executing-plans`, checkpoint em `qa-artifacts/Q8-progress/` |

### Kill switches (env vars)
- `ENFORCE_SUSPENSION=false` → destrava todos os tenants
- `ADMIN_MFA_REQUIRED=false` → admin loga sem MFA
- `ADMIN_MFA_BYPASS_EMAIL=seuemail` → seu admin específico bypassa
- `ADMIN_RATE_LIMIT_BYPASS_IPS=ip1,ip2` → seu IP bypassa rate limit
- `FINANCE_RETRY_ENABLED=false` → desativa retry de finance entries
- `WEBHOOK_RETRY_ENABLED=false` → desativa retry de webhook

---

## 9. Regras de parada (não negociáveis)

🛑 **Eu paro obrigatoriamente:**
- Audit revelou dados financeiros corrompidos em prod
- Migration vai destruir dado (DROP/ALTER incompatível)
- Vulnerabilidade descoberta fora do escopo
- Spec mudou após review (descobri algo grande)
- Teste E2E falha de forma inexplicável
- Agentes paralelos deram outputs contraditórios

🟡 **Pergunto antes de seguir:**
- Decisões de produto (timing, copy, defaults)
- Trade-off técnico (custo vs simplicidade)
- Algo visível ao cliente final (UI, email, copy)

🟢 **Sigo sozinho (te aviso no fim):**
- Bug fix óbvio
- Teste falhando que eu sei consertar
- Refactor interno sem mudança de comportamento
- Adicionar log/observability

---

## 10. Definition of Done — Q8 fechado

Critério binário. 10 itens, todos precisam estar ✅:

1. ☐ Tenant inadimplente é bloqueado em ≤1h após webhook (testado com tenant fake)
2. ☐ Webhook Asaas falho é reprocessado automaticamente (testado simulando 500)
3. ☐ Estorno AR cria FinanceEntry compensatório (testado em shift aberto + fechado)
4. ☐ Script de auditoria roda em prod e retorna 0 ghost data (ou plano de cleanup aprovado)
5. ☐ Admin requer MFA pra logar (testado: sem TOTP, login falha)
6. ☐ APIs admin têm rate limit (testado: spam em /actions bloqueia em <10 req)
7. ☐ `prisma migrate diff --exit-code --from-url $STAGING_URL --to-schema-datamodel ./prisma/schema.prisma` retorna exit 0 ("No difference detected")
8. ☐ 3 E2E críticos passam em CI (venda à vista, parcelada, receber parcela)
9. ☐ Você consegue logar em /admin, ver dashboard, suspender 1 tenant teste, voltar acesso
10. ☐ Cash shift close passa em teste de 10 closes paralelos (1 sucesso, 9 conflitos) — fecha P0-8 do audit anterior

Se 10/10 verde → **Q8 fechado, sistema vendável**.

---

## 11. Entregáveis finais

**Código:**
- ~25-35 commits direto na main (modelo atual do projeto)
- Exceção: Q8.4 (schema) e Q8.3 (MFA) podem ir via branch + PR auto-merged se você quiser deploy preview pra testar antes (sua decisão na hora)

**Infra:**
- 2 Vercel Cron jobs: `/api/cron/tick` (super-cron `*/5`) + `/api/cron/dunning` (`0 8 * * *` mantido)
- Migration baseline aplicada em prod
- Sentry ativo

**Documentação:**
- Este spec (aprovado)
- `qa-artifacts/Q8-baseline/` — estado antes
- `qa-artifacts/Q8-data-audit.md` — Q8.0.5
- `qa-artifacts/Q8-finance-audit.md` — Q8.2.4
- `qa-artifacts/Q8-final/` — estado depois com diffs
- `CHANGELOG.md` atualizado
- `docs/Q8-retro.md` — lessons learned
- `BLUEPRINT_FUNCIONAL_PDV.md` atualizado

**Testes:**
- Test coverage não regride
- 3 E2E críticos verdes em CI
- Smoke das 10 páginas top verde em CI

---

## 12. Próximos passos imediatos

1. Você aprova este spec
2. Eu invoco `writing-plans` skill para gerar plano executável passo-a-passo
3. Você revisa o plano executável (mais detalhado, com tasks atômicas)
4. Eu começo execução pela Q8.0
