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
