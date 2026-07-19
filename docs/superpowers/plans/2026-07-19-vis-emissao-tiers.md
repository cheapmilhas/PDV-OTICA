# Plano de implementação — Emissão de tiers de plano Vis → Domus

> Deriva da spec `docs/superpowers/specs/2026-07-19-vis-emissao-tiers-design.md` (forja + 3 rodadas Codex). Alto risco: cobrança auto-aplicada, HMAC multi-tenant, migração em prod, rollout cross-repo. **Cada fase: implemento → testo → Codex revisa o diff → corrijo → testo.** Migração SEMPRE hand-written `.sql` + `migrate deploy` (NUNCA `migrate dev`/`db push` — `.env`=prod, incidente de banco zerado).

## ⚠️ FATIAMENTO (decisão do dono 2026-07-19)
A revisão do plano pelo Codex revelou que isto NÃO é 1 sprint — são ~4 entregas independentes. **Esta sessão executa SÓ a Fase 1** (catálogo + service + publish v1 — pequeno, seguro, sem cobrança nova nem endpoint). As fases 2-4 são sprints PRÓPRIOS, cada um com forja/Codex, e carregam os 4 P0 que o Codex achou (abaixo). Nada de self-service/cobrança/relógio nesta sessão.

### P0 do Codex a resolver ANTES de cada fase futura (registro):
- **Fase endpoint+saga (V4):** a máquina de estados `RECEIVED→LOCAL_APPLIED→BILLING_CONFIRMED|FAILED` NÃO suporta upgrade Asaas-first nem recuperação de crash. Precisa `RECEIVED→BILLING_REQUESTED→BILLING_CONFIRMED→LOCAL_APPLIED→COMPLETED` com retomada por estado + resposta Asaas persistida. "Replay=200 sem reaplicar" é perigoso: replay de op incompleta deve RETOMAR, não retornar sucesso.
- **Fase relógio (V3):** `sourceRevision` exige INVENTÁRIO de todos os writers de Company/Subscription (admin, checkout, webhooks Asaas, dunning, subscription-watch, reconciliation, ativação) — cada um incrementa na mesma tx. `READ COMMITTED` não basta → `REPEATABLE READ`/snapshot em 1 query. **v2 sem plan.tier é REJEITADO pelo Domus** (`vis-entitlement-sync.ts:123` faz `return null`) → ramos sem plano continuam `version:1` (NÃO v2). É fase grande.
- **Fase downgrade (nova):** `period_end` exige coluna `pendingPlanId`+`effectiveAt` em Subscription + cron/worker que efetiva na virada + idempotência do executor + Asaas. Feature própria. `Subscription` não tem plano pendente hoje.
- **Rollout D1.3 (Domus):** `eventId` estável = outbox no Domus (schema+dispatcher+claim+retry), não `randomUUID()` por execução. Subdividir. E 5.4 (ligar switch) exige precondição: commit Domus com D1.3 EM PROD + teste timeout→retry preservando eventId. Falta canary/allowlist pro gate de observação (5.3-5.4 é circular sem bypass autenticado).
- **Reconciliação (5.2):** NÃO por no app Vis credencial do banco Domus. Script no Vis exporta esperados + script no Domus exporta mirrors → comparador local.

---
## ✅ FASE 1 (ESTA SESSÃO) — Catálogo + service + publish v1

Escopo: criar os 2 planos Medical, extrair o service `applyPlanChange` da rota admin, ligar o publish nos handlers mudos. **Sem endpoint, sem cobrança nova, sem relógio.** V2 (publish v1) é wire-compatible com o Domus atual (Codex confirmou); a troca pra Profissional reflete como `clinic_full` até a fase do relógio — janela temporária ACEITA (o super admin sabe).

Correções dos achados do Codex aplicáveis à Fase 1:
- **Plan.tier NULLABLE** (não NOT NULL DEFAULT) — plano de ótica não tem tier; Medical sem tier = fail-closed no `resolvePlanForTier`. (Resolve a divergência spec×plano que o Codex apontou: a spec dizia default clinic_full; venceu NULLABLE.)
- **Catálogo por SEED explícito** (comando próprio), não DML na migração nem esperar `migrate deploy` semear. Gate verifica o seed rodou.
- **Preflight reforçado** (0.1): `lock_timeout`+`statement_timeout` curtos, sessões idle-in-transaction, blockers de `Plan`, labels do enum, versão PG, estado `_prisma_migrations`, definição atual das colunas (detectar migração parcial).
- **`billingPolicy` tipada explícita** no service (não inferir por actor.type): `admin_fail_soft` | `self_service_upgrade_confirm_first` | `scheduled_downgrade`. Na Fase 1 só `admin_fail_soft` é usado (preserva o comportamento atual do admin); os outros ficam definidos mas sem chamador até a fase do endpoint.
- **`operationId` do admin:** o service gera se o chamador não passar (admin não tem eventId do Domus).

## Ordem inegociável (por quê o rollout é faseado)

O Domus está em PROD recebendo entitlement v1/v2 e ordenando por `sourceUpdatedAt <=`. Mudar o relógio ou o contrato do Vis primeiro QUEBRA o receptor. Por isso: **o Domus aceita o novo esquema ANTES de o Vis emitir nele** (receiver-first). E o endpoint self-service fica atrás do kill-switch até a saga estar completa nos dois lados.

---

## FASE 0 — Preflight (read-only, sem escrita)

- [ ] **0.1** Preflight no banco de PROD do Vis (read-only): `SELECT count(*) FROM "Plan"`, `SELECT slug, "priceMonthly", "isActive" FROM "Plan"`, contar Companies VIS_MEDICAL vinculadas (`platformProduct='VIS_MEDICAL' AND "domusClinicId" IS NOT NULL`), checar transações longas antes de qualquer `ALTER TABLE` (o `ADD COLUMN` pega ACCESS EXCLUSIVE lock).
- [ ] **0.2** Confirmar no repo Domus: o receptor `vis-entitlement-sync.ts` parser (linha 108 exige `sourceUpdatedAt`), o `setWhere <=` (250), a preservação de `plan_tier` em v1 (207), e o fail-open do secret (`entitlements/route.ts:28`). Documentar o que precisa mudar no Domus (fases D).

**Gate:** contagens conhecidas, sem lock pendente. NÃO prosseguir se o banco parecer anômalo (lição do incidente).

---

## FASE V1 — Catálogo de planos Medical (Vis, migração)

- [ ] **V1.1** Migração hand-written: `ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "platformProduct" "PlatformProduct" NOT NULL DEFAULT 'VIS_APP'` (marca produto do plano) + `CREATE TYPE "PlanTier"` guardado (`DO $$ ... EXCEPTION WHEN duplicate_object`) + `ADD COLUMN IF NOT EXISTS "tier" "PlanTier"` (NULLABLE — plano não-Medical não tem tier; Medical sem tier = fail-closed) + `ADD COLUMN IF NOT EXISTS "selfServiceSelectable" BOOLEAN NOT NULL DEFAULT false`. Espelhar no `schema.prisma` no MESMO commit (mesmo nome/tipo/default) pra evitar drift.
- [ ] **V1.2** Seed idempotente dos 2 planos comerciais (por slug, `upsert`): `medical-profissional` (priceMonthly 8990, priceYearly 89900, platformProduct VIS_MEDICAL, tier `specialist`, selfServiceSelectable true) e `medical-clinica` (18990/189900, VIS_MEDICAL, tier `clinic_full`, selfServiceSelectable true). Classificar `interno-domus` como VIS_MEDICAL/`clinic_full`/selfServiceSelectable=false.
- [ ] **V1.3** Helper `resolvePlanForTier(tier)`: `Plan where platformProduct='VIS_MEDICAL' AND tier=? AND selfServiceSelectable=true AND isActive=true`; **exige exatamente 1** (0 ou >1 → throw fail-closed). Teste unit cobrindo 0/1/N.
- [ ] **V1.4** Aplicar migração em PROD: `./node_modules/.bin/prisma migrate deploy`. Verificar coluna presente + 2 planos criados por query.

**Gate:** tsc 0; `resolvePlanForTier` testado; migração aplicada e verificada; Codex revisa o `.sql` (idempotência, lock, guard do CREATE TYPE).

---

## FASE V2 — Service de troca de plano (Vis, extração, SEM cobrança nova)

- [ ] **V2.1** Extrair `applyPlanChange({ companyId, targetPlanId, actor: {type, id, name}, effectiveMode: 'immediate'|'period_end', operationId })` da lógica inline de `change_plan` (`actions/route.ts`). Ator TIPADO (admin OU domus-self-service). NÃO muda comportamento do admin ainda (admin chama com `effectiveMode:'immediate'`, ator ADMIN_USER).
- [ ] **V2.2** A rota admin `change_plan` passa a chamar o service (refactor puro, mesmo efeito) + passa a **publicar** (`schedulePublishEntitlement`) — hoje não publica (:205). Idem `reactivate` (:65), `cancel_subscription` (:287).
- [ ] **V2.3** Idempotência do Asaas: o service usa `operationId` como chave da chamada Asaas (substitui `change-plan:${sub.id}:${plan.id}` que tem bug A→B→A, :159).
- [ ] **V2.4** Testes: refactor não quebra os testes existentes de `change_plan`; publish é disparado; `operationId` chega ao Asaas.

**Gate:** tsc 0; suíte de billing/subscription verde; Codex revisa o diff (extração preserva o fail-soft do admin, ator correto, publish nos 3 handlers).

---

## FASE D1 — Domus receiver-first (repo Domus, ANTES do Vis emitir novo relógio)

> Feito no worktree do Domus. NÃO mergear no Vis. Coordenação: estas mudanças vão pro Domus primeiro.

- [ ] **D1.1** Fail-closed do secret: `entitlements/route.ts` rejeita quando `!VIS_DOMUS_WEBHOOK_SECRET` ANTES de verificar (hoje `?? ""` = fail-open).
- [ ] **D1.2** Coluna `source_revision` bigint NULLABLE no espelho `clinic_entitlements` (migração drizzle). Parser aceita AMBOS: usa revision quando presente, senão `sourceUpdatedAt` (comportamento atual). Uma vez que uma clínica tem `source_revision` não-null, payload SEM revision nunca sobrescreve (proteção de transição).
- [ ] **D1.3** `eventId` estável por operação no `request-plan-change`/`domus-vis-client`: outbox/persistido (não `randomUUID()` a cada execução — retry viraria evento novo). Enviar `eventId` no corpo do plan-change.
- [ ] **D1.4** Receptor aceita snapshot terminal `writeAllowed:false, reason:"COMPANY_DELETED"`.
- [ ] **D1.5** Testes no Domus + Codex revisa.

**Gate:** Domus aceita revision E timestamp; secret fail-closed; eventId estável; deploy do Domus em prod ANTES da Fase V3.

---

## FASE V3 — Relógio monotônico + payload v2 (Vis, DEPOIS de D1 em prod)

- [ ] **V3.1** Coluna `sourceRevision` bigint em `Company` (ou tabela de revisão), incrementada na MESMA transação de toda mudança publicável. Migração hand-written.
- [ ] **V3.2** `checkSubscription` aceita tx client compartilhado (snapshot coerente — READ COMMITTED não basta entre queries). `buildEntitlementPayload` lê tier+plano+subscription+revision numa transação.
- [ ] **V3.3** Payload `version:2` ADITIVO: `plan:{tier}` (3 tiers literais) + `sourceRevision` (mantém `sourceUpdatedAt` — não remove, senão Domus rejeita). Tier deriva de `Plan.tier` do plano ativo; ramos sem plano NÃO emitem `plan.tier`.
- [ ] **V3.4** Testes: torn read coberto (teste que simula leitura fora de ordem); v1/v2 co-existência; ramos sem plano preservam tier.

**Gate:** tsc 0; testes de projeção/sync verdes; Codex revisa (snapshot atômico real, revision monotônico, aditividade v2).

---

## FASE V4 — Endpoint plan-change + saga (Vis, atrás do kill-switch)

- [ ] **V4.1** Env `DOMUS_VIS_API_SECRET` (novo, ≠ webhook) + `VIS_TIER_SELF_SERVICE_ENABLED` (kill-switch, default OFF). Sem o secret → endpoint fail-closed.
- [ ] **V4.2** Tabela `DomusPlanChangeOp { id, visCompanyId, eventId @unique, requestedTier, state, payloadHash, createdAt, expiresAt }` (migração). Estados RECEIVED→LOCAL_APPLIED→BILLING_CONFIRMED|FAILED.
- [ ] **V4.3** `POST /api/internal/domus/plan-change`: (1) HMAC `verifyVisDomus` fail-closed; (2) autorizar `visCompanyId` do corpo por `platformProduct=VIS_MEDICAL`+vínculo (404 genérico se não); (3) `resolvePlanForTier`; (4) idempotência por `eventId` (replay = 200 sem reaplicar; payloadHash diferente = 409); (5) saga serializada por subscription; (6) `applyPlanChange` com política de cobrança (upgrade só após Asaas confirmar; downgrade `period_end`; sem `asaasSubscriptionId` → não aplica, responde indisponível); (7) publicar v2 de volta. Kill-switch OFF → responde "indisponível, contate suporte" sem tocar cobrança.
- [ ] **V4.4** Testes: anti-oráculo (company inexistente/outro produto = mesma 404); A→B→A com eventIds distintos aplica 3×; replay mesmo eventId = idempotente; upgrade com Asaas falhando NÃO libera; downgrade agenda; kill-switch OFF não cobra; concorrência (2 cliques) serializa.

**Gate:** tsc 0; suíte completa do endpoint verde; Codex + challenge adversarial (ele tenta forjar visCompanyId, replay, escalar tier sem pagar); kill-switch OFF em prod inicialmente.

---

## FASE 5 — Verificação, backfill e ligar

- [ ] **5.1** Backfill: republish v2 de cada Company VIS_MEDICAL vinculada (não `schedulePublishEntitlement` fire-and-forget — `publishEntitlementForCompany` awaited em loop, coletando resultado).
- [ ] **5.2** Reconciliação BILATERAL por chave (não amostragem — Domus é fail-open): `{Companies VIS_MEDICAL vinculadas no Vis}` == `{mirrors v2 no Domus}`; lista nominal dos faltantes.
- [ ] **5.3** E2E de sombra por tier: trocar company de teste → `specialist` → confirmar no Domus que estética/convênios/comissões/BI somem; → `clinic_full` → confirmam volta.
- [ ] **5.4** Só então: ligar `VIS_TIER_SELF_SERVICE_ENABLED=true` (decisão do dono após validar a cobrança auto-aplicada em observação).

**Gate final:** reconciliação fecha (contagem, não amostra) · E2E sombra verde nos 2 tiers · cobrança auto-aplicada validada em observação · kill-switch e bypass exercitados · Codex assina o conjunto.

---

## Riscos aceitos (dívida consciente)

- **Estado terminal do delete só entregue por webhook** (pull não re-envia deletadas) — se o webhook falhar, clínica deletada mantém acesso até intervenção. Aceitar ou adicionar fila de retry (decidir na Fase V4).
- **Autenticação por-serviço, não por-tenant** (HMAC global) — mitigado por validação de produto/vínculo; item pós-MVP: secret por-clínica ou header assinado.
- **Downgrade não estorna** (Asaas não prora) — mitigado agendando pra `period_end` (cliente usa o que pagou).
- **Reclassificar `Plan.tier` com assinantes** = operação massiva (reclassifica todas as clínicas do plano) — proibir edição livre; exigir operação dedicada que incrementa revision + publica cada company.
