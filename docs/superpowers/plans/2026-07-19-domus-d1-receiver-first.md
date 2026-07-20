# Plano D1 — Domus receiver-first (pré-requisito da Fase V3 do Vis)

> Repo: `~/SISTEMACLINICADOMUS` (drizzle/pg). Alto risco: migração em prod, rollout cross-repo, cobrança a jusante. Worktree separado. Cada sub-fase: implemento → testo → Codex revisa → corrijo → testo. Migração hand-written (sem dev DB isolado — DATABASE_URL = prod).

## Contexto verificado no código (2026-07-19)

- **D1.1 JÁ FEITO:** `vis-domus-hmac.ts:26` faz `if (!secret) return { ok: false, reason: "secret_missing" }` — fail-CLOSED. O "fail-open do receptor" da spec antiga não existe mais. **Removido do escopo.**
- Receptor (`vis-entitlement-sync.ts`): ordena por `setWhere: sourceUpdatedAt <= X` (`:250`, `<=` intencional p/ refrescar synced_at no pull). Parser exige `sourceUpdatedAt` string (`:110`), aceita v2 com `plan.tier` não-vazio (`:124`), v1 preserva `plan_tier` (`:207`). Idempotência por eventId no webhook já existe (`:165`).
- Emissor plan-change (`request-plan-change/index.ts:47`): manda `idempotencyKey: ${visCompanyId}:${requestedTier}` e **NÃO manda eventId**. Comentário `:44` chama isso de "chave estável" — mas É o bug A→B→A (voltar a um tier já pedido colide com a 1ª ida).
- Schema `clinic_entitlements`: PK `clinic_id`, `unique(vis_company_id)`, `plan_tier text default 'clinic_full'`, `source_updated_at timestamptz notnull`, sem coluna de revisão.

## Escopo D1 (3 sub-fases, D1.1 já caiu)

### D1.2 — `source_revision` + parser dual (o núcleo)

**Objetivo:** dar ao Domus um relógio estritamente ordenável por clínica, aceitando AMBOS (revision quando presente, senão timestamp), para que a Fase V3 do Vis possa emitir `sourceRevision` sem quebrar o receptor.

- Migração drizzle hand-written: `ALTER TABLE clinic_entitlements ADD COLUMN IF NOT EXISTS source_revision bigint` (NULLABLE). Espelhar no `schema.ts`.
- Parser (`validateSnapshot`): aceitar `sourceRevision` opcional (bigint como number|string). Não obrigatório (v1/v2 legado sem revision continua válido).
- Ordenação no `upsertMirror` (`setWhere`): regra dual —
  - Se o payload traz `sourceRevision` E a linha já tem `source_revision` não-null → comparar por revision (`stored.source_revision <= incoming`).
  - Se a linha tem revision não-null e o payload NÃO traz revision → **rejeitar** (stale), nunca sobrescrever (proteção de transição: legado não reordena uma clínica já migrada).
  - Se a linha tem revision null → comportamento atual (`source_updated_at <=`), e grava o `source_revision` recebido (se houver).
- Igualdade de revision: mesmo payloadHash (retry) refresca `synced_at`; payload diferente com mesma revision → rejeita.

### D1.3 — `eventId` estável via OUTBOX COMPLETO (emissor) — ESCOLHA DO DONO

**Objetivo:** o Domus gerar um `eventId` único POR OPERAÇÃO, estável entre retries, persistido, com drenador durável — garante "operação nunca fica órfã" quando dinheiro real entra. Substitui `${visCompanyId}:${requestedTier}` (bug A→B→A).

**Schema outbox** (corrige #8 requested_by, #9 unicidade lógica):
```
plan_change_requests {
  id            uuid pk default gen_random_uuid()
  clinic_id     uuid  notnull references clinics(id)
  vis_company_id text notnull        -- snapshot do espelho no momento
  requested_tier text notnull
  requested_by   text notnull        -- ctx.user.id persistido (cron não tem)
  event_id       uuid notnull unique -- gerado 1×, estável entre retries
  status         text notnull default 'PENDING'  -- PENDING|SENT|FAILED
  attempts       int  notnull default 0
  last_error     text
  created_at     timestamptz notnull default now()
  sent_at        timestamptz
}
-- unicidade lógica de operação ATIVA por clínica (corrige #9: 2 abas/reload):
-- partial unique index: uma linha PENDING por clinic_id.
CREATE UNIQUE INDEX plan_change_requests_active_uq
  ON plan_change_requests (clinic_id) WHERE status = 'PENDING';
```

**`request-plan-change`** (server action): dentro de 1 transação —
1. resolve `visCompanyId` do espelho (como hoje, anti confused-deputy);
2. INSERT no outbox (`event_id = randomUUID()`, status PENDING, `requested_by = ctx.user.id`). Se colidir no partial unique (já há PENDING pra essa clínica) → reusa a linha existente (mesmo event_id) OU responde "já há uma troca em andamento" (decidir: reusar é mais amigável). Isso mata os 2-submits paralelos (#9).
3. tenta o envio síncrono (best-effort): sucesso → status SENT + sent_at; falha → deixa PENDING (o cron drena). A action retorna "pending" como hoje.

**`postPlanChange`/`PlanChangeRequest`:** adiciona `eventId` ao corpo. Mantém `idempotencyKey` por compat (o Vis novo deduplica por eventId — dependência cross-repo #7).

**Dispatcher** `GET /api/cron/plan-change-dispatch` (padrão do Domus: Bearer CRON_SECRET fail-closed, registrar em `vercel.json`):
- SELECT linhas PENDING (com `attempts < N`), `FOR UPDATE SKIP LOCKED` (claim seguro — Vercel Hobby pode disparar 2×);
- reenvia via `postPlanChange` reusando o MESMO event_id persistido (retry idempotente no Vis);
- sucesso → SENT; falha → attempts++ + last_error, continua PENDING até esgotar → FAILED (alerta/log).
- **Cadência:** Vercel Hobby = 1×/dia. Se precisar mais rápido, cron-job.org (padrão já usado no ecossistema). MVP: 1×/dia + envio síncrono cobre o caso comum; o cron é a rede de segurança.

**UI (`plan-picker.tsx`):** hoje o estado pendente é só React local (perdido no reload, #9). Melhoria mínima: a action retorna o `event_id`/status; a página pode ler `plan_change_requests` PENDING da clínica no load pra mostrar "troca em andamento". (Pode ser dívida pós-MVP se apertar o escopo — o partial unique já impede duplicata no banco.)

### D1.4 — terminal `COMPANY_DELETED`

**Objetivo:** receptor aceitar snapshot terminal `{writeAllowed:false, reason:"COMPANY_DELETED"}` (v1, sem plan.tier) — o Vis publica isso antes de marcar DELETED; o pull não re-envia deletadas, então o webhook é a única entrega.

- Verificar: o parser/upsert atual JÁ aceita writeAllowed:false com reason arbitrário (`:120-121` só checa tipo). Provável que D1.4 seja só **confirmar + teste**, sem código novo no receptor. Se o upsert grava writeAllowed=false e preserva tier → pronto.

## 🔨 Correções pós-Codex (rodada 1 — read-only no Domus)

Triagem dos 12 achados. Reais aceitos, falsos rejeitados:

**D1.2 (source_revision):**
- **#5 [aceito] bigint = string decimal no wire.** Revision trafega como string `^[0-9]+$` (JSON não carrega bigint; drizzle `mode:number` perde precisão >2^53). Coluna `bigint`; `rawSnapshot` mantém a string. Contrato pro Vis: emitir revision como string decimal.
- **#2 [aceito] ramo "revision igual" roda o UPDATE idempotente COMPLETO**, não só synced_at — senão `deny_verified_until` não renova e bloqueio válido vira fail-open em 48h (`upsertMirror:240` reescreve deny hoje; preservar isso).
- **#3 [aceito] payloadHash removido do MVP.** Empate de revision (mesma revision, payload possivelmente diferente por eventId variável no pull) → aplica o update idempotente (não rejeita). A regra "payload diferente mesma revision → rejeita" exigiria hash canônico determinístico (excluindo eventId) — dívida pós-MVP, não vale a complexidade agora. Revision estritamente maior vence; igual refresca; menor = stale.
- **#12 [rejeitado — era MINHA suspeita, Codex confirmou infundada]:** a regra dual CABE num único `setWhere` com ramos `IS NULL`/`IS NOT NULL` sob o lock do ON CONFLICT. NÃO vira read-then-write. Desenho atômico validado.
- **#4 [mitigado]:** clínica com revision NULL mantém comportamento atual (sem regressão no receiver-first puro, Codex confirmou). Risco só em rollback parcial do Vis → mitigado pela spec V3.3 (Vis nunca remove sourceUpdatedAt, emite ambos).

**D1.3 (outbox):**
- **#6/#8/#9 [aceito — outbox durável exige drenador].** MVP "inline + status" cria fila sem cron que a esvazie (`vercel.json` não tem cron de outbox) → linha PENDING órfã, pior que o fire-and-forget atual. Schema precisa de `requested_by` (cron não tem `ctx.user`) + coluna de compat. `event_id unique` não impede 2 submits paralelos (2 abas/reload) — trava atual é só estado React. **Decisão:** ou (a) manter fire-and-forget + eventId gerado 1× e passado no corpo (SEM tabela outbox — mais simples, resolve A→B→A sem fila durável), ou (b) outbox completo com cron. Ver veredito abaixo.
- **#7 [aceito — cross-repo]:** manter `idempotencyKey` antiga preserva A→B→A SE o Vis ainda deduplicar por ela. O Vis novo (Fase V4) deduplica por `eventId` e tem fallback. Dependência cross-repo registrada, não bloqueia o Domus.

**D1.4 (terminal) — REORIENTADO:**
- **#1 [P0 aceito — muda o desenho].** COMPANY_DELETED via TTL comum NÃO é terminal: o guard só bloqueia enquanto `denyVerifiedUntil > now` (`assert-write-allowed.ts:37`); company deletada some da lista canônica do cron → deny não renova → **fail-open em 48h**. Não é "só confirmar + teste". Solução (escolher): (a) para `reason==="COMPANY_DELETED"`, gravar `denyVerifiedUntil` = data no futuro distante (bloqueio que não expira sem depender de renovação); OU (b) coluna/flag `terminal` no espelho que o guard cheque ANTES do TTL. Cross-repo: o Vis precisa publicar o tombstone por webhook (o pull nunca re-envia deletada). Se o webhook falhar, tombstone não chega — risco conhecido, avaliar fila de retry.
- **#10 [P2 pré-existente]:** eventId repetido com payload diferente → `idempotent` silencioso (short-circuit em `:164`). Não introduzido por D1; registrar.

## Ordem e gate

D1.2 → D1.4 → (D1.3 conforme decisão de escopo). Deploy Domus prod ANTES da Fase V3 do Vis. Gate: Domus aceita revision E timestamp; ramo igual renova deny; tombstone não expira; Codex revisa cada diff; testes verdes.

## Fora de escopo (dívida consciente)
- payloadHash canônico (regra "payload≠ mesma revision → rejeita") — pós-MVP.
- Dispatcher com claim distribuído robusto.
- O fix do Vis (emitir sourceRevision como string decimal) é a Fase V3.
- Fix #10 (short-circuit eventId) — pré-existente, ticket próprio.
