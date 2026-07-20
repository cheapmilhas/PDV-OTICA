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

### ✅ FASE D FEITA (D1+D2, 2026-07-20) — estados terminais + alerta atômico
Implementada (NÃO em prod). Dono decidiu: BILLING_REQUESTED esgotado → MANUAL_REVIEW+alerta (SEM reconciliação GET Asaas — fail-safe, nunca esconde cobrança). Codex quebrou o plano ingênuo (from+attemptCount global escondia cobrança). Entregue:
- **SagaResult UNIÃO DISCRIMINADA** (completed|terminal|retryable_failure|lost_lease). Rota mapeia kind→HTTP (200/409/502/202); não combina flags frágeis (o `failed` antigo virava 502 num terminal financeiro). Op que já entra terminal humano → terminal (não "completed").
- **Contador POR ESTADO** (não por claim): claimOp não incrementa mais; `beginAttempt(op,state)` CAS incrementa por estado; transition/applyLocal resetam attemptCount=0 no avanço. Codex: claim conta posse, não tentativa financeira.
- **MATRIZ ao esgotar MAX=5** (classifyAndPromote): RECEIVED→FAILED_BEFORE_BILLING (seguro, sem alerta); BILLING_REQUESTED→MANUAL_REVIEW+alerta (AMBÍGUO); BILLING_CONFIRMED→CHARGED_NOT_APPLIED+alerta (cobrado); **LOCAL_APPLIED FORA do corte** (plano já aplicado; segue tentando publish→COMPLETED — cortá-lo prenderia a op pra sempre, achado Codex).
- **markFinancialTerminalAndAlert ATÔMICO**: $transaction — CAS terminal + `systemEvent.upsert(dedupeKey)` no MESMO commit → terminal implica evento; falha no evento reverte a promoção (op segue retomável). source "billing", severity critical.
- **Fronteira de erro** (achado Codex): beginAttempt/classifyAndPromote/upsert dentro do try do loop → exceção vira retryable estruturado (recordError), não 500 genérico.
- **Fix health cron**: auto-resolve só toca `dedupeKey.endsWith(":auto")` (era `${source}:auto` reconstruído → auto-resolveria o alerta billing). SystemEventView expõe dedupeKey; source "billing" adicionado ao union.
- Codex 2 rodadas, achados fechados (LOCAL_APPLIED starvation; fronteira de erro do alerta). tsc 0, 96 testes domínio.
- **🚨 NOTA DEPLOY:** auditar em prod se há SystemEvent auto com `dedupeKey=null` legado ANTES do deploy — o novo filtro `endsWith(":auto")` os excluiria da auto-resolução (ensureAutoEvent sempre cria chave hoje, então só afeta dados malformados).

### FASE E — Worker (cron) — SÓ AGORA
`GET /api/cron/plan-change-retry` (Bearer CRON_SECRET). Seleciona não-terminais com nextAttemptAt<now, claim por lease, runSaga. NÃO tem gate global do kill-switch (ops em voo já cobradas TÊM que completar mesmo com switch OFF — resolve P0 #7). Batch pequeno, backoff. **Fase E ainda deve: setar nextAttemptAt no retryable (o executor NÃO faz backoff hoje — o lease preso 90s é o único throttle); separar release do lease de backoff; interpretar attemptCount por estado.**
Gate: retoma BILLING_CONFIRMED sem recobrar; concorrência serializa; esgota→CHARGED_NOT_APPLIED+alerta; expirada classifica; Codex + challenge adversarial (cobrança).

### 📐 DESIGN E SINTETIZADO (meu plano + plano independente do Codex, 2026-07-20)
Alto risco → plano meu + Codex quebrou em paralelo (7 achados reais). Sem migração (colunas da Fase A já existem). Incorporado:

**1. `scheduleRetry(op, from)` nos deps (backoff + release atômicos) — resolve (a)+(b).** Um CAS `WHERE id AND state=from AND leaseToken=meu`: num único UPDATE seta `nextAttemptAt = now()+delay` (relógio do BANCO, não claimedAt — achado Codex #5: claimedAt pode estar velho após runSaga longo) E libera `leaseToken=NULL, leaseUntil=NULL`. Retorna `{applied}`; zero linhas = perdi a posse (não agenda). Backoff exponencial por attemptCount do ESTADO (que já reseta no avanço — cada etapa tem seu orçamento) com teto + jitter no processo. `delay = min(BASE * 2^(attempt-1), TETO)` ± jitter.

**2. `scheduleRetry` é chamado por AMBOS os chamadores de runSaga — achado Codex #4 (P1).** Se só o worker chamasse, uma falha originada no ENDPOINT deixaria o lease preso 90s + nextAttemptAt NULL + 202 aos replays. A obrigação (b) vale para todo `retryable_failure`. Endpoint e worker aplicam a MESMA política pós-resultado. `lost_lease`/`terminal`/`completed` NÃO liberam (respectivamente: outro conduz; filtro de claim já barra).

**3. Expiração de BILLING_REQUESTED — achado Codex #3 (P0), DECISÃO DO DONO.** O executor só checava expiresAt em RECEIVED → uma op parada em BILLING_REQUESTED cobraria com preço congelado meses depois. Dono decidiu: **BILLING_REQUESTED vencida → MANUAL_REVIEW + alerta** (NÃO FAILED_BEFORE_BILLING — esconderia cobrança se o PUT chegou e a resposta se perdeu). Adiciona a checagem de expiresAt no ramo BILLING_REQUESTED (antes do renewLease/confirmBilling) via `markFinancialTerminalAndAlert`. Mudança no executor, mas é a matriz de terminal da Fase D.

**4. Worker: findMany pré-filtro (só ids) → claimOp por id → runSaga → scheduleRetry se retryable.** O findMany é barato e NÃO é a trava — o claimOp (CAS atômico) é. Codex confirmou: findMany→claimOp é seguro (só um vence o UPDATE...RETURNING). Batch pequeno (10). Erros por-op isolados (try/catch por op; um erro não derruba o batch). Ordenação JUSTA — achado Codex #7: `ORDER BY nextAttemptAt ASC NULLS FIRST, createdAt ASC` (senão ops com nextAttemptAt NULL — as mais antigas/nunca-agendadas — ficariam por último e uma fila de LOCAL_APPLIED, que nunca é cortado, as afamaria).

**5. Sem gate do kill-switch no worker — resolve P0 #7 + política state-aware (achado Codex #6).** Op só é criada com switch ON; pós-cobrança (BILLING_CONFIRMED/LOCAL_APPLIED) TEM que completar mesmo OFF. Pré-cobrança vencida vira terminal (item 3). Documentado.

**6. vercel.json: registra o path.** Frequência real via cron-job.org (Vercel Hobby=1×/dia). Registro a 15min como referência.

**🚨 NOTA DE DEPLOY (achado Codex #2, P0) — DECISÃO DO DONO: auditoria antes de ligar.** Ops existentes têm nextAttemptAt=NULL → o worker as pegaria no 1º tick e re-executaria (re-cobrança). Tabela HOJE em 0 linhas + self-service OFF → na prática não há órfãs, mas o cron pode entrar antes de ligar o switch. GATE de deploy: ANTES de ativar o cron, rodar auditoria das ops retomáveis (especialmente BILLING_REQUESTED antiga); se houver, resolver manualmente. Não há backfill (tabela vazia).

**Dívidas NÃO-bloqueantes registradas (Codex):** #1 "billing confirmed"==preço-futuro-atualizado, não pagamento-recebido (natureza do produto: assinatura recorrente sem proration; `status===ACTIVE` garante recorrência viva; pré-condição de LIGAR, não do worker). #8 expiresAt origem mista processo×banco (skew Neon ms; mudaria o create do endpoint; adiado). IdempotencyKey do PUT Asaas na retomada = validar em SANDBOX (pré-condição de LIGAR).

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

## ✅ FASE C FEITA (2026-07-20) — lease/fencing
Implementada (NÃO em prod). `ClaimedSagaOp` (leaseToken não-nullable) = único tipo que runSaga processa. `claimOp(id)`: `UPDATE...RETURNING` num $queryRaw, CAS pelo relógio do BANCO (now()), WHERE estado retomável + lease livre + nextAttemptAt passado; grava token(randomUUID)+leaseUntil+attemptCount+1; RETURNING now() AS claimedAt (relógio do banco vira o `now` do runSaga). Fencing (`AND leaseToken=?`) em TODO CAS: transition/applyLocal(interno)/recordError/markTerminal. NÃO usa leaseUntil>now no predicado (fencing = substituição de token, não prazo). renewLease antes de confirmBilling e antes de publish. reloadOp traz leaseToken; resyncOnLostCas: token real≠meu → PARA (não adota estado nem publica). Timeout Asaas 30s (<TTL 90s) via AbortController. Endpoint: claimOp antes de runSaga; null → RELÊ estado e classifica (COMPLETED→200, terminal humano→409, retomável→202). Codex 2 rodadas, achados fechados: (1ª) claim-null mascarava terminal→409; validação resposta Asaas (id/valor/ciclo); ttlMs guard; claimedAt do banco. (2ª) validar `updated.status==="ACTIVE"` (id/valor/ciclo certos não provam recorrência viva); ttlMs arredondado. tsc 0, ~86 testes.

### Dívidas registradas (Codex, fases posteriores — NÃO bloqueiam C):
- **attemptCount conta AQUISIÇÕES DE LEASE, não tentativas financeiras** — a Fase E deve interpretar por ESTADO (uma op gasta "tentativa" em publish/crash/expiração antes do efeito financeiro), ou separar contadores por etapa.
- **Lease preso vira backoff implícito** — em erro tratado, o executor termina mas NÃO libera o lease → replays recebem 202 por até 90s embora ninguém processe. Fase D/E: separar `nextAttemptAt` (backoff) de release condicional do lease.
- **P2002 resume→202 sem tentar claim** (`route.ts`): se o vencedor morreu entre create e claim, o perdedor não recupera imediato (worker repara). Fase E: `redo.kind==="resume"` poderia cair no fluxo comum found→claimOp.
- **expiresAt origem mista** — gravado com relógio do PROCESSO no create, comparado com claimedAt do banco. Endurecimento (TTL 7 dias): calcular expiresAt no banco OU usar createdAt do banco.
- **Payload incompleto do PUT Asaas → loop determinístico** — se o PUT não devolver o objeto completo (cycle/status ausente), a op trava em BILLING_REQUESTED revalidando. Fail-closed (seguro), mas: CONFIRMAR EM SANDBOX que o PUT devolve o objeto completo; se não, fazer GET após PUT OU tratar 2xx incompleto como ambíguo→manual review.
- **Limpar leaseToken ao chegar terminal** — cosmético (filtro de estado já barra claim de terminal).

## ✅ FASE E FEITA (2026-07-20) — worker de retry + backoff, SEM migração
Implementada (NÃO em prod). Alto risco → plano meu + plano independente do Codex em paralelo; Codex revisou o DIFF em 2 rodadas (protocolo anti-loop), 12 achados reais no total, todos fechados. tsc 0, **127 testes** do domínio (1282 no sweep lib+cron+internal, 0 regressão).

**Entregue:**
- **`scheduleRetry(op, from)` (deps):** backoff + release do lease ATÔMICOS num CAS fenced por state+leaseToken — `nextAttemptAt=now()+delay` (relógio do BANCO, não claimedAt defasado) E `leaseToken/leaseUntil=NULL`. Lê attemptCount fresco sob o lease. `retryDelayMs`: exponencial BASE 1min, TETO 1h ABSOLUTO (Math.min DEPOIS do jitter ±25%). Chamado por AMBOS worker E endpoint no `retryable_failure` (sem isto, falha do endpoint deixava lease preso 90s + nextAttemptAt NULL).
- **Expiração de BILLING_REQUESTED (executor):** vencida → MANUAL_REVIEW+alerta (SEM cobrar; DECISÃO DO DONO). BILLING_CONFIRMED/LOCAL_APPLIED NÃO expiram (pós-cobrança sempre completa).
- **`confirmBilling` revalida expiração + POSSE pelo relógio do BANCO** logo antes do Asaas (achado Codex P1): claimedAt do claim pode estar velho; op vencida ou lease perdido entre claim e PUT → não cobra.
- **Worker `runRetryBatch` (retry-worker.ts) + cron `GET /api/cron/plan-change-retry`:** pré-filtro (só ids) → claimOp (trava real) → runSaga → scheduleRetry. Batch 5 (10×30s Asaas encostaria em 300s), `maxDuration=300`. Erro por-op isolado; catch com `releaseLease` (CAS fenced SÓ por token, aceita qualquer estado retomável — o runSaga pode ter avançado o estado antes de lançar; scheduleRetry por state-velho não pegaria = poison NULL). Bearer CRON_SECRET fail-closed, withHeartbeat.
- **KILL-SWITCH STATE-AWARE (achado Codex P0, as 2 rodadas):** ON → 4 estados. OFF → pós-cobrança SEMPRE (cliente cobrado TEM que receber) + pré-cobrança **SÓ se vencida** (`expiresAt<=now`, lane de classificação-sem-Asaas: uma BILLING_REQUESTED cobrada cuja resposta se perdeu vira MANUAL_REVIEW+alerta mesmo com OFF, senão ficaria INVISÍVEL durante o incidente). Pré-cobrança NÃO-vencida fica parada (não cobra durante possível incidente Asaas). Cláusulas SQL ESTÁTICAS por switch (índice-friendly).
- **Métrica honesta:** `retried` só se scheduleRetry.applied; senão lostLease. Endpoint scheduleRetry em try/catch best-effort (não vira 500).
- **vercel.json:** cron `0 * * * *` (frequência real via cron-job.org).

**Dívida ACEITÁVEL registrada (Codex, não-bloqueante — tolerável com monitoramento):**
- **Janela residual** entre o guard pré-PUT e o PUT do Asaas (leituras de identidade/assinatura no meio): inevitável (banco+Asaas não-atômicos), pequena; o fencing do `transition` pós-confirmBilling é a rede final.
- **`expiresAt` origem mista** (Date.now do processo no create vs now() do banco na comparação): skew Neon ~ms; mudaria o create do endpoint; adiado.
- **Índice/ordenação:** `nextAttemptAt ASC NULLS FIRST, createdAt ASC` exige sort (createdAt fora do `retry_idx`); performance, não correção — `EXPLAIN` no deploy.

**🔒 PRÉ-CONDIÇÕES de LIGAR `VIS_TIER_SELF_SERVICE_ENABLED` (worker pode deployar antes; não liga o switch):**
1. Validar em SANDBOX Asaas que `PUT /subscriptions/{id}` honra `asaas-idempotency-key` (retomada não dobra fatura) E devolve o objeto completo (id/value/cycle/status) — senão a op trava em BILLING_REQUESTED (fail-closed) até o TTL→MANUAL_REVIEW.
2. **🚨 AUDITORIA pré-deploy do cron (achado Codex P0, decisão do dono):** ops retomáveis existentes têm nextAttemptAt=NULL → o worker as pegaria no 1º tick. Tabela HOJE em 0 linhas + self-service OFF → sem órfãs na prática, MAS rodar a query de auditoria (especialmente BILLING_REQUESTED antiga) ANTES de ativar o cron; se houver, resolver manualmente. Sem backfill (tabela vazia).
3. "Billing confirmed" == preço-futuro-atualizado + `status===ACTIVE`, NÃO pagamento-recebido (natureza da assinatura recorrente sem proration). Confirmar que essa semântica é aceita como confirmação financeira antes de ligar.

## 🚨 NOTA DE DEPLOY (achado Codex) — índice não-CONCURRENTLY
Os `CREATE UNIQUE INDEX` da migração B em `GlobalAudit` e `subscription_history` (tabelas GRANDES, produção) NÃO são `CONCURRENTLY` — e não podem ser, porque `migrate deploy` roda cada migração em 1 tx e `CREATE INDEX CONCURRENTLY` proíbe tx. Enquanto o índice varre a tabela, ele pega lock que BLOQUEIA writes normais de audit/history. ANTES de aplicar em prod: MEDIR tamanho de `GlobalAudit`/`subscription_history`. Se grandes, criar os 2 índices únicos parciais MANUALMENTE com `CREATE UNIQUE INDEX CONCURRENTLY` fora do migrate (e marcar a migração como aplicada) OU aceitar a janela de lock num horário de baixo tráfego. O índice de op ativa em `DomusPlanChangeOp` (0 linhas) é instantâneo, sem risco.
