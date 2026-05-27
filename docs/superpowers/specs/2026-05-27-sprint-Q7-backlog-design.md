# Sprint Q7 — Backlog Audit 2026-05-27

**Data:** 2026-05-27
**Branch:** main
**Contexto:** Audit completo em `qa-artifacts/audit-2026-05-27/SYNTHESIS.md` identificou 36 itens. **14 foram resolvidos em rajada hoje** (quick wins de ≤30min). **22 ficaram pendentes** por exigirem trabalho substantivo (>1h cada).

Este spec organiza os 22 itens em sub-sprints Q7.1 → Q7.4, cada um com escopo focado e estimável.

---

## Resumo do que JÁ foi feito hoje (14 itens, ~3h total)

Commits:
- `1a0af92` — fix(audit-q7-p0): 4 cross-tenant/IDOR fixes
- `e8cadff` — fix(audit-q7-p1): gating + leak + rate limit + timing
- `abfdae3` — fix(audit-q7-p2-p3): admin seed + barcode + docs + UX

Itens resolvidos:
- P0-1 inventory_lots guard
- P0-2 processExpiredCashbacks branchId
- P0-3 CRM template companyId leak
- P0-4 IDOR /api/users/[id]/permissions
- P1-1 lens_treatments/[id] guard
- P1-2 /api/sales/[id]/cashback companyId
- P1-4 rate limit register + login
- P1-9 timing leak (bcrypt dummy)
- P2-1 admin123 hard-coded
- P2-7 barcode.isCodeAvailable global
- P3-1 docs "13" → "16"
- P3-3 cashback/goals mobile-nav feature
- P3-4 useEffect deps PDV F4
- P3-5 /api/test-sentry SUPER_ADMIN gate

---

## Q7.1 — Financeiro crítico (~10-15h)

Os 4 CRITICAL financeiros do audit anterior que continuam vivos:

### P0-5 — Estorno AR não reverte CashMovement nem FinanceEntry
**Esforço:** 2-4h
**Onde:** `src/app/api/accounts-receivable/route.ts:373-427`
**Risco:** Ghost cash no fechamento de caixa (R$ aparece no AR estornado mas continua no shift).
**Ação:**
- Ao estornar AR (`status: PENDING`, `receivedAmount: 0`), criar `CashMovement` reverso com mesmo valor.
- Reverter `FinanceEntry` (criar entry compensatório negativo na conta de destino).
- Testar: fluxo de venda → recebimento → estorno → fechamento shift. Saldo final = saldo inicial.

### P0-6 — CREDIT_CARD cashDate = data da venda
**Esforço:** 1-2h
**Onde:** `src/services/finance-entry.service.ts:382`
**Risco:** Cash flow projeta cartão como dinheiro D+0 (na verdade D+30).
**Ação:**
- Quando `payment.method === "CREDIT_CARD"`, calcular `cashDate = payment.completedAt + 30 dias` (ou usar `settlementDate` da adquirente quando existir no schema).
- Adicionar setting `companySettings.cardSettlementDays` (default 30).

### P0-7 — FinanceAccount.balance CARD_ACQUIRER double-count
**Esforço:** 1-2h
**Onde:** `src/services/finance-entry.service.ts:387-392`
**Risco:** Saldo da conta cartão soma a venda imediatamente E ao receber settlement = double-count.
**Ação:**
- Para `account.kind === "CARD_ACQUIRER"`, NÃO incrementar `balance` no momento da venda.
- Incrementar só ao receber settlement (job de reconciliação ou webhook adquirente).
- Mostrar saldo "previsto" vs "disponível" no UI.

### P0-8 — Race CashShift close
**Esforço:** 1h
**Onde:** service de close de shift
**Risco:** Dois usuários fecham o mesmo turno simultaneamente, duplicando saldo.
**Ação:**
- Update condicional: `UPDATE CashShift SET status=CLOSED WHERE id=? AND status=OPEN` retornando rowsAffected.
- Se 0, retornar 409 "shift já fechado".

### P1-5 — Cashback race: balance check fora da transação
**Esforço:** 1-2h
**Onde:** `src/services/sale.service.ts:254-271`
**Risco:** Dois clicks paralelos podem usar o mesmo saldo (race time-of-check/time-of-use).
**Ação:**
- Mover `findUnique` pra dentro do `$transaction`.
- Usar `UPDATE customerCashback SET balance = balance - ? WHERE id = ? AND balance >= ?` retornando rowsAffected. Se 0, throw "saldo insuficiente".

### P1-10 — F-9 silent swallow no DRE
**Esforço:** 4-6h
**Onde:** `src/services/sale-side-effects.service.ts:482-498`
**Risco:** `generateSaleEntries` falha → venda completa mas DRE com furo. Sem retry, contador precisa corrigir manualmente.
**Ação:**
- Criar model `FinanceEntryRetry` (saleId, attempt, lastError, nextRetryAt, status).
- Catch no `generateSaleEntries` cria registro retry em vez de só logar.
- Cron `/api/cron/retry-finance-entries` processa retries pendentes (max 5 tentativas, backoff exponencial).

---

## Q7.2 — Infra e schema (~8-12h)

### P1-3 — Rate limiter in-memory → Upstash/Redis
**Esforço:** 4-8h
**Onde:** `src/lib/rate-limit.ts:5`
**Risco:** Cold start serverless reseta o Map; sob ataque distribuído, rate limit não funciona.
**Ação:**
- Conta Upstash Redis (free tier).
- Substituir `Map` por chamadas Redis `INCR + EXPIRE`.
- Env vars `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Fallback in-memory se Redis indisponível (graceful degradation).

### P1-6 — Drift schema (24+ campos em Company sem migration)
**Esforço:** 1h
**Onde:** `prisma/schema.prisma:89-212` vs `prisma/migrations/`
**Risco:** Sistema depende de `prisma db push` em prod. Ambiente novo precisa setup manual.
**Ação:**
- Gerar migration baseline: `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_baseline/migration.sql`.
- Marcar como aplicada no `_prisma_migrations` da prod: `prisma migrate resolve --applied 0_baseline`.
- Adicionar `prisma migrate deploy` ao build pipeline (Vercel `buildCommand`).

### P1-7 — Webhook Asaas sem HMAC
**Esforço:** 1h
**Onde:** `src/app/api/webhooks/asaas/route.ts`
**Risco:** Token bearer pode vazar; HMAC dá assinatura por payload.
**Ação:**
- Pegar secret do Asaas (painel da conta).
- Verificar header `Asaas-Signature` contra HMAC-SHA256 do body raw.
- Manter token bearer como fallback durante transição.

### P1-8 — Audit middleware bypassa $transaction
**Esforço:** 2-3h
**Onde:** `src/lib/prisma-audit-middleware.ts`
**Risco:** Audit logs ficam inconsistentes; `result?.companyId` instável.
**Ação:**
- Reescrever middleware para usar `tx` quando disponível.
- Sair de `result?.companyId` para argumento explícito ou `where.companyId`.
- Testes: cenário rollback transaction → audit log também não persiste.

### P2-10 — 12 índices faltando
**Esforço:** 1-2h
**Onde:** `prisma/schema.prisma`
**Risco:** Listagens grandes ficam lentas.
**Ação:**
- Adicionar 12 `@@index` listados no audit anterior (`qa-artifacts/audit-2026-05-26/agent-2-database.md`).
- Gerar migration e aplicar.

### P3-6 — qa-drift-check.ts expandir cobertura
**Esforço:** 1h
**Onde:** `scripts/qa-drift-check.ts`
**Risco:** Drift de índices/enums passa silencioso.
**Ação:**
- Cobrir todas as tabelas do schema (loop dinâmico).
- Diff de `@@index` e `enum`.

---

## Q7.3 — Cleanup e padrões (~15-20h)

### P2-4 — 74 console.error → logger.error
**Esforço:** 4-6h
**Risco:** Logs em prod sem estrutura — Sentry não pega contexto.
**Ação:** Sweep de `console.error` em `src/services/` e `src/app/api/`. Substituir por `log.error("...", { ...context })`.

### P2-5 — N+1 em sale.service.create
**Esforço:** 2h
**Onde:** `src/services/sale.service.ts:460+`
**Ação:** Pré-fetch `costPrice` de TODOS os produtos em bulk antes do loop.

### P2-6 — validateBranchOwnership sweep
**Esforço:** 3-4h
**Risco:** ~20 endpoints aceitam `branchId` no body sem validar — branch cross-tenant.
**Ação:** Identificar todos os endpoints que aceitam `branchId`, adicionar `await validateBranchOwnership(branchId, companyId)`.

### P2-11 — prisma-tenant adopt
**Esforço:** 8-16h
**Risco:** Isolamento por convenção (manual). Refactor pra usar Prisma extensions ou middleware automático.
**Ação:** Decisão arquitetural primeiro — exibir POC, validar, depois refactor.

### P2-12 — APIs órfãs cleanup (~25 rotas)
**Esforço:** 2-4h
**Ação:**
- Confirmar cada uma das 25 órfãs listadas em `agent-3-integration.md` §2.2.
- Remover rotas + service methods + UI fragments que dependiam.
- Manter as legítimas (webhooks, cron, bootstrap).

### P2-9 — RENEGOTIATED workflow (AR)
**Esforço:** 4h
**Ação:**
- UI: botão "Renegociar" na conta a receber.
- Schema: campos `renegotiatedFromId`, `renegotiatedAt`, `originalAmount`.
- Service: ao renegociar, marca conta original como `RENEGOTIATED`, cria nova com novos termos.

### P2-8 — checkAndMarkDelayed cron
**Esforço:** 1h
**Onde:** `src/services/service-order.service.ts:checkAndMarkDelayed`
**Ação:**
- Criar `src/app/api/cron/mark-delayed/route.ts`.
- Adicionar entry em `vercel.json` cron (diário às 08:00).

---

## Q7.4 — Polish (~3-5h)

### P2-2 — Testes 13/16 features
**Esforço:** 30min
**Onde:** `src/lib/__tests__/api-coverage.test.ts`, `find-blocked-feature.test.ts`
**Ação:** Adicionar 3 entries (`cashback`, `goals`, `inventory_lots`) com paths representativos.

### P2-3 — Inconsistência requirePlanFeature vs withPlanFeatureGuard
**Esforço:** 1h decisão + ajuste
**Risco:** Sem subscription, requirePlanFeature libera mas withGuard bloqueia.
**Ação:**
- Decidir: comportamento "sem sub" = libera (modo onboarding/seed) OU bloqueia (fail-closed).
- Padronizar nos dois pontos.

### P3-2 — Mobile-nav 5 features faltando
**Esforço:** 30min
**Onde:** `src/components/layout/mobile-nav.tsx`
**Ação:** Adicionar entries em `moreNav` para Tratamentos, Transferências, Comparativo Lojas, Cartões, Despesas Recorrentes (com `feature:` correspondente).

---

## Sequência sugerida

1. **Q7.1 financeiro** — primeira sub-sprint, alto impacto em correção de dados.
2. **Q7.2 infra+schema** — segunda sub-sprint, vai estabilizar prod.
3. **Q7.3 cleanup** — pode ser feito em background ao longo das outras.
4. **Q7.4 polish** — última semana, junto com QA.

**Estimativa total Q7:** 36-52h (3 sub-sprints densos ou 1 mês de trabalho normal).

---

## Não-incluído (decisões conscientes)

Nada — todos os 36 itens foram aprovados pelo usuário. 14 já feitos hoje, 22 viram este backlog.
