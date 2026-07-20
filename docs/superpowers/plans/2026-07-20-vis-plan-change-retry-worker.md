# Plano — Endurecer a saga de troca de plano + worker de retry

> Pré-condição #2 de ligar o self-service. Alto risco: cobrança em prod. O Codex quebrou o plano do "worker primeiro" — o worker sozinho PIORA (roda runSaga concorrente sobre passos não-idempotentes/não-monotônicos → acha as janelas de inconsistência mais rápido, com dinheiro no meio). Ordem correta: FUNDAÇÃO antes do worker. Cada fase: implemento → testo → Codex revisa → corrijo.

## Diagnóstico (5 P0 do Codex, confirmados no código)
1. **applyLocal NÃO é atômico com o checkpoint** (`executor.ts:74` applyLocal, `:76` saveState = 2 tx). Crash no meio → reaplica, duplica subscriptionHistory+globalAudit, histórico com fromPlanId==toPlanId.
2. **saveState incondicional** (`deps.ts:110` update por id) → executor atrasado REGRIDE COMPLETED→BILLING_CONFIRMED. Nenhum passo é monotônico.
3. **Subscription buscada por companyId+status** (`deps.ts:19,56`), não pelo id persistido → pode cobrar X e aplicar Y; ou não achar se virou SUSPENDED.
4. **FAILED mistura falha-segura com cliente-cobrado-sem-plano.** Executor nem trata FAILED como terminal (`executor.ts:41` só COMPLETED) → cai em "estado inválido".
5. **expiresAt>now esconderia o incidente crítico** (op cobrada que expirou sem aplicar).
+ asaasRef é a própria chave, não a resposta do Asaas (`deps.ts:50`). asaas.update sem timeout no fetch.

## Sequência (fatiada, cada fase deploya sozinha)

### FASE A — Migração (fundação de dados, sem lógica nova)
Coluna(s) em DomusPlanChangeOp:
- `subscriptionId String?` + `asaasSubscriptionId String?` + `priceApplied Int?` + `billingCycle` — **identidade da assinatura persistida** (resolve P0 #3): fixada ANTES de cobrar, usada por confirmBilling E applyLocal.
- `attemptCount Int @default(0)` + `lastAttemptAt` + `nextAttemptAt` (backoff).
- `leaseToken String?` + `leaseUntil DateTime?` — claim compartilhado (resolve P0 #2).
- `billingRequestedAt` + `billingConfirmedAt` — timestamps financeiros.
Estados novos no enum DomusPlanChangeOpState: `CHARGED_NOT_APPLIED`, `MANUAL_REVIEW` (separa P0 #4). Migração hand-written idempotente. `decideSagaAction` trata os novos como TERMINAIS (não resume — precisa humano).
Índice pro polling do worker (state + nextAttemptAt + leaseUntil).
Gate: schema espelhado, tsc 0, migração idempotente, Codex revisa.

### FASE B — applyLocal atômico + CAS monotônico (o coração)
- `applyLocal` vira UMA transação interativa: CAS da op `BILLING_CONFIRMED→LOCAL_APPLIED` (`WHERE id=? AND state='BILLING_CONFIRMED' AND leaseToken=?`) + os efeitos (subscription, company, history, audit) no MESMO commit. CAS afeta 0 linhas → não aplica (relê: já LOCAL_APPLIED/COMPLETED = no-op; outro = conflito).
- Toda transição do executor vira condicional (fencing por state+leaseToken). `saveState` incondicional MORRE.
- applyLocal/confirmBilling usam a **identidade persistida** (subscriptionId/asaasSubscriptionId da op), não busca por companyId.
- Defesa extra: `planChangeOpId @unique` em subscriptionHistory/globalAudit OU numa tabela de efeito (impede 2ª linha).
Gate: testes de idempotência (aplicar 2× = 1 efeito), monotonia (não regride), Codex + challenge.

### FASE C — Claim por lease compartilhado (endpoint E worker)
- Função única `claimOp(eventId|id)`: tx curta CAS `WHERE state=<lido> AND (leaseUntil IS NULL OR leaseUntil<now)` → grava leaseToken+leaseUntil, incrementa attemptCount, retorna a linha. Rede (Asaas) FORA do lock.
- Endpoint passa a claimar antes de runSaga (hoje roda sem claim — `route.ts:188`). Worker usa o MESMO claim.
- Serializa por subscription/company, não só por op.id (2 ops da mesma company não intercalam Asaas).
Gate: teste de concorrência (2 executores, 1 aplica), Codex.

### FASE D — Estados terminais + alerta persistente (dívida ao cliente)
- Ao esgotar attemptCount APÓS cobrança → `CHARGED_NOT_APPLIED` (não FAILED genérico). Falha ANTES de cobrar → `FAILED_BEFORE_BILLING` (seguro).
- Op expirada: RECEIVED→cancela; BILLING_CONFIRMED/LOCAL_APPLIED expirada→CHARGED_NOT_APPLIED/continua publish; NÃO some do filtro.
- Alerta via `SystemEvent` (já existe, dedupe+alertedAt) + fila de e-mail (`system-alert.service`), dedupe por `plan-change:${op.id}:charged-unapplied`. Sentry é no-op sem DSN.
Gate: teste de classificação de erro, alerta dispara, Codex.

### FASE E — Worker (cron) — SÓ AGORA
`GET /api/cron/plan-change-retry` (Bearer CRON_SECRET). Seleciona não-terminais com nextAttemptAt<now, claim por lease, runSaga. NÃO tem gate global do kill-switch (ops em voo já cobradas TÊM que completar mesmo com switch OFF — resolve P0 #7). Batch pequeno, backoff.
Gate: retoma BILLING_CONFIRMED sem recobrar; concorrência serializa; esgota→CHARGED_NOT_APPLIED+alerta; expirada classifica; Codex + challenge adversarial (cobrança).

## Pré-condição externa (paralela, não bloqueia A-D)
Validar em SANDBOX Asaas que `PUT /subscriptions/{id}` honra `asaas-idempotency-key` (não dobra fatura; janela de retenção; mesma key+payload≠ recusa). + adicionar timeout no asaas fetch. Sem isso, o Asaas-first não é seguro mesmo com lease.

## Fora de escopo
Downgrade agendado (Fase 4, já 501). Estorno automático (CHARGED_NOT_APPLIED alerta humano, não estorna sozinho — dinheiro).

## ✅ FASE A + B FEITAS (2026-07-20)
- **FASE A EM PROD** (commit `94195b68`): migração `20260720120000_plan_change_op_hardening` aplicada via `prisma migrate deploy` (dono rodou com `!`). Verificado: 11 colunas, 3 estados de enum, índice parcial de retry, tabela 0 linhas.
- **FASE B IMPLEMENTADA** (NÃO em prod): applyLocal atômico (CAS `BILLING_CONFIRMED→LOCAL_APPLIED` 1ª escrita da tx + efeitos no mesmo commit), `saveState` incondicional MORREU (virou `transition`/`recordError`/`markTerminal` com CAS + `reloadOp`), identidade persistida + preflight, `planChangeOpId` único em history/audit. Migração `20260720140000_plan_change_op_atomicity` (2 colunas + índices únicos parciais). Codex quebrou o diff (7 achados, todos reais, todos corrigidos):
  1. preço>0 (endpoint fresh + confirmBilling) — priceYearly=0 cobraria R$0 e liberaria tier.
  2. fail-closed 0/>1 subscription elegível + exige asaasSubscriptionId ANTES de criar op (senão op de identidade nula falha em loop e envenena a company via índice ativo).
  3. `expiresAt` LIDO no executor (RECEIVED expirada → FAILED_BEFORE_BILLING; depois de billing não expira cegamente).
  4. P2002 resolvido POR ESTADO (relê eventId→livre=índice ativo→409; existe=replay), NÃO por `meta.target` (frágil; caía em 202 sem criar op).
  5. applyLocal REVALIDA identidade completa (companyId+asaasSubscriptionId) DENTRO da tx via FOR UPDATE — assinatura pode ter sido substituída entre CAS e efeitos.
  6. `resyncOnLostCas` só adota avanço ESTRITO/terminal (progressRank) — regressão reexecutaria confirmBilling = dupla cobrança.
  7. índice de op ativa inclui CHARGED_NOT_APPLIED+MANUAL_REVIEW — incidente financeiro bloqueia nova op até resolução humana.

## 🚨 NOTA DE DEPLOY (achado Codex) — índice não-CONCURRENTLY
Os `CREATE UNIQUE INDEX` da migração B em `GlobalAudit` e `subscription_history` (tabelas GRANDES, produção) NÃO são `CONCURRENTLY` — e não podem ser, porque `migrate deploy` roda cada migração em 1 tx e `CREATE INDEX CONCURRENTLY` proíbe tx. Enquanto o índice varre a tabela, ele pega lock que BLOQUEIA writes normais de audit/history. ANTES de aplicar em prod: MEDIR tamanho de `GlobalAudit`/`subscription_history`. Se grandes, criar os 2 índices únicos parciais MANUALMENTE com `CREATE UNIQUE INDEX CONCURRENTLY` fora do migrate (e marcar a migração como aplicada) OU aceitar a janela de lock num horário de baixo tráfego. O índice de op ativa em `DomusPlanChangeOp` (0 linhas) é instantâneo, sem risco.
