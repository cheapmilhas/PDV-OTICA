# Plano V3 — Relógio monotônico + payload v2 (Vis)

> Síntese: meu plano + plano INDEPENDENTE do Codex (alto risco → dois planos em paralelo). Ativa o D1 do Domus (já pronto no branch). Deriva da spec `2026-07-19-vis-emissao-tiers-design.md`. Migração hand-written contra PROD (sem dev DB; incidente de banco zerado recente → cuidado redobrado).

## Decisão de arquitetura (síntese dos dois planos)

O problema central: `sourceRevision` precisa ser estritamente monotônico por company e refletir TODA mudança publicável, sem depender de incrementar manualmente em ~26 writers (frágil, esquecível). **Abordagem escolhida: B+ (Codex refinou meu B).**

**Rejeitadas:**
- **A (incremento manual em 26 writers):** insustentável — 1 esquecido = torn read persiste; writer futuro esquece. Middleware Prisma não cobre SQL direto/migrations.
- **C (revision gerada na publicação via nextval):** corrida real — P1 abre snapshot velho, P2 publica revision maior, P1 atrasado publica revision ainda maior sobre estado velho → Domus aceita o velho. Só correto com `pg_advisory_xact_lock` por company (protocolo sutil, e ordena PUBLICAÇÃO, não MUTAÇÃO).
- **D (xmin/txid):** xmin não é relógio da projeção (Company e Subscription têm xmin diferentes; Plan não aparece no xmin da Company); wraparound; ordem de alocação ≠ ordem de commit.

**Escolhida — B+ (trigger + tabela dedicada):**
- Tabela `EntitlementRevision(company_id PK/FK, revision bigint)` — NÃO coluna em Company (evita recursão com `Company.updatedAt @updatedAt`, evita churn quando `healthScore` muda, serializa por company numa linha).
- Sequence global bigint. Trigger seta `revision = nextval(seq)` na linha da company quando muda estado publicável.
- Triggers cobrem (gap que meu plano original tinha):
  - `Subscription`: INSERT, UPDATE (status, planId, trialEndsAt, pastDueSince, currentPeriodEnd), DELETE, e UPDATE OF companyId (incrementa a company antiga E a nova).
  - `Company`: INSERT + UPDATE dos campos publicáveis APENAS (isBlocked, accessEnabled, platformProduct, domusClinicId) — não todo update (healthScore muda muito).
  - `Plan.tier`/`Plan.name`: **política de imutabilidade** — tier/name de um Plan com assinantes NÃO se edita (cria-se novo Plan). Já registrado como "reclassificar Plan.tier é operação massiva". Um trigger fan-out em Plan geraria locks longos/deadlocks — evitar.

## Snapshot atômico (V3.2) — resolve o torn read

Hoje `buildEntitlementPayload` tem 3 visões do banco: findUnique(Company) + findFirst(Subscription) + checkSubscription(global). Vira UMA transação interativa Prisma `REPEATABLE READ`:
1. materializa expiração de trial (condicional);
2. lê Company;
3. lê Subscription canônica + plan.name + plan.tier (orderBy `[createdAt desc, id desc]` — hoje só createdAt permite empate);
4. lê EntitlementRevision;
5. avaliador PURO de decisão/projeção;
6. monta snapshot v2;
7. commit; SÓ DEPOIS assina + fetch (fetch NUNCA dentro da tx).

Refatorar `checkSubscription` (função CENTRAL de gating) em 3 peças, sem quebrar o gating:
- `expireTrialIfNeeded(db, companyId, now)` — a mutação (hoje subscription.ts:142).
- `loadSubscriptionSnapshot(db, companyId)` — leitura.
- `evaluateSubscription(snapshot, policy, now)` — PURA.
- `checkSubscription(companyId)` continua a API central (wrapper sobre as peças com prisma global). O publisher chama as PEÇAS com o TransactionClient da tx.
- Retry limitado em erro de serialização (REPEATABLE READ pode abortar sob concorrência de trial).

## Payload v2 (V3.3)

`buildEntitlementPayload` sobe pra `version: 2`, ADITIVO: `plan: { tier }` (3 tiers literais) + `sourceRevision` (STRING decimal — `revision.toString()`, bigint não serializa JSON). MANTÉM `sourceUpdatedAt` (Domus rejeita se ausente). Tier deriva de `Plan.tier` do plano ativo; ramos SEM plano NÃO emitem `plan.tier` (continuam v1 — Domus preserva o tier gravado).

## 🚨 Riscos que o Codex mapeou e eu não tinha (CRÍTICOS)

1. **Restore/PITR do Neon faz a sequence RETROCEDER** abaixo do que o Domus já recebeu → Domus rejeita snapshots novos como stale para sempre. **Dado o incidente de banco zerado recente, isto é REAL.** Mitigação: antes de recolocar um banco restaurado como PROD, reseedar a sequence acima da maior revision já observada, OU epoch. Documentar no runbook de restore.
2. **Políticas em ENV não incrementam revision:** `ENFORCE_SUSPENSION`, `SUBSCRIPTION_BYPASS_COMPANY_IDS` mudam a decisão sem tocar o banco → revision não muda → Domus não vê a mudança até o pull. Dívida consciente (essas envs são de emergência global, raras) OU `policyRevision`.
3. **Trial expira SEM escrita** até alguém materializar — cron confiável ou materialização no publish/pull.
4. **DDL via DIRECT_URL** (não pooled) — trigger/migração aplicados pela conexão direta, não a pooled do runtime.
5. **Contenção/deadlock:** triggers na mesma linha por company serializam; transações multi-company precisam ordem consistente + retry.

## Ordem e gate

Migração (tabela + sequence + triggers, hand-written, DIRECT_URL) → schema.prisma espelhado → refactor checkSubscription em peças → snapshot atômico no publisher → payload v2 → backfill EntitlementRevision das companies existentes → testes (torn read coberto, v1/v2 coexistência, ramos sem plano). Codex + challenge adversarial. Deploy: Domus D1 PRIMEIRO (já pronto), depois Vis V3.

## Escopo — DECISÃO DO DONO pendente
Isto é MAIOR que "adicionar coluna": trigger de banco + refactor de gating central + snapshot transacional + runbook de restore. Fatiar ou fazer inteiro?
