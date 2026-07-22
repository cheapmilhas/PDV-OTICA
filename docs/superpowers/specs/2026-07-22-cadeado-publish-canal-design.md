# Cadeado — Canal de publish de entitlement Vis→Domus (design)

**Data:** 2026-07-22
**Status:** Design aprovado pelo dono, aguardando review do spec-reviewer.
**Risco:** ALTO (billing + multi-tenant + DDL de função/trigger contra banco de PROD). Codex revisa a spec e cada fase do código. Lição do incidente 17/07 (banco zerado): migração só com `prisma migrate deploy`, nunca `migrate dev`/`db push`.
**Contexto:** [[cadeado-publish-forja-panel]], [[vis-tiers-emissao-forja]], [[vis-medical-cadeado-sprint2]].

---

## 1. Problema

O Domus (produto clínico) bloqueia escrita clínica por inadimplência **lendo o espelho de entitlement** que o Vis (operadora) publica. O DTO `writeAllowed` reflete o estado atual da assinatura/company da clínica.

Só **alguns** dos ~12 call-sites que mudam `Subscription.status` (ou `Company.isBlocked/accessEnabled`) publicam esse estado ao Domus. Os demais só chegam ao Domus no **pull diário de reparação (~24h)**. Consequência: uma clínica que fica inadimplente (ou volta a pagar) pode continuar bloqueada/liberada de forma errada por até 24h.

O Codex provou que isto é uma **classe**, não pontos isolados: corrigir call-site por call-site é whack-a-mole (3 fixes feitos manualmente, +3 achados na sequência). A solução tem de garantir que **toda** transição publicável propague, sem depender de lembrar de chamar o publisher em cada writer.

### Fatos do código que fundamentam o design (verificados, não especulados)

- **O publisher revalida tudo por companyId.** `buildEntitlementPayload(companyId)` (`src/lib/vis-domus-publisher.ts:54`) relê Company + Subscription + `checkSubscription` + `EntitlementRevision` numa tx REPEATABLE READ. `writeAllowed`/tier/status/revision vêm da releitura fresca, **não** do estado que a mutação carregava. Único risco = "entregar companyId errado/nenhum"; nunca vaza cross-tenant (no-op se não-VIS_MEDICAL ou sem `domusClinicId`, `:101`). Isso torna "republicar por companyId" seguro e idempotente.
- **O `prisma` global usa `$use` (tenant-guard + audit), não `$extends`.** Um interceptor via `$extends` cria client derivado; os ~9 writers de Subscription usam o `prisma` base → passariam por fora. Captura app-level via `$extends` está **morta**.
- **`checkSubscription` (`src/lib/subscription.ts:160`) é ele próprio um writer** (`updateMany` TRIAL→TRIAL_EXPIRED) e roda dentro do publish. Interceptor app-level no Subscription se auto-dispararia (reentrância).
- **Os `updateMany` reais não têm companyId no where:** webhook Asaas (`route.ts:208/265/273`) por `id` (PK); dunning + subscription-watch por `status`, varrendo N companies de tenants distintos numa tacada. Extração ingênua de companyId em qualquer interceptor app quebra (perde/infla companies).
- **Já existe o trigger `EntitlementRevision`** (migration `20260719140000_entitlement_revision`): `AFTER … FOR EACH ROW` em Subscription **e** Company, com `WHEN` filtrando os campos publicáveis (status/planId/trialEndsAt/pastDueSince/currentPeriodEnd em Subscription; isBlocked/accessEnabled/platformProduct/domusClinicId em Company). Roda na **mesma tx** da mutação, atômico com o commit. Toda a captura passa por **uma única função**: `bump_entitlement_revision(target_company_id)`.
- **Não existe outbox genérico reusável.** `DomusPlanChangeOp` é saga bespoke; o único "outbox" é do WhatsApp. Esta spec constrói infra nova, mas segue o padrão dos triggers V3a e do dispatcher do Domus D1.3.

---

## 2. Solução — duas peças complementares, dois deploys

O sobrevivente da forja (painel 3×3, opções A e C rejeitadas como FATAL) é **Opção 0 + Opção B**, entregues em **duas fases deployáveis independentes**, na ordem abaixo.

### Fase 1 (baixo risco, vai a prod primeiro): fixes inline + cron de reconcile

Fecha o hot path na hora e corta a janela dos call-sites secundários de 24h→1h. Zero migração, zero trigger novo, zero DDL. Deploy fácil não fica refém do deploy de risco.

### Fase 2 (alto risco, fechamento durável): trigger → outbox → worker

Fecha a **classe inteira** de forma durável e dirigida por evento, sobrevivendo a crash/freeze do serverless. Migração de função + tabela contra o banco de prod, com preflight e ritual completo.

**Os 3 fixes inline permanecem** após a Fase 2 (decisão do dono: manter + outbox por cima). São o caminho síncrono de baixa latência no hot path; o outbox é a rede durável que pega tudo. Belt-and-suspenders no fluxo de dinheiro: se o publish inline falhar (rede/freeze), o trigger já gravou no outbox e o worker republica.

---

## 3. Fase 1 — detalhe

### 3.1 Os 3 fixes inline (já no working tree, revisados contra o Codex)

Cobrem 3 ramos em 2 arquivos. Ambos usam `await publishEntitlementForCompany(...)` (não fire-and-forget — em serverless o freeze pós-resposta corta promises soltas).

- **`src/app/api/cron/dunning/route.ts`** (suspend + cancel): acumula as companies que mudaram de estado num `Set<string>` (dedup: uma sub pode ser suspensa E cancelada no mesmo run → 1 publish) e publica ao **final** do batch, com `await` + concorrência limitada a 5.
- **`src/app/api/webhooks/asaas/route.ts`** (payment confirmado + cancel): pagamento confirmado → `await publishEntitlementForCompany(companyId)` (desbloqueia na hora, senão a clínica ficaria bloqueada ~24h após pagar); cancel → mesmo (bloqueia na hora).

Estes fixes ficam como estão. Vão a prod na Fase 1.

### 3.2 Cron de reconcile horário (código novo)

- **Handler:** `GET /api/cron/reconcile-entitlements`. Auth Bearer `CRON_SECRET` fail-closed (mesmo padrão dos outros crons; rejeitar se o header não bate). `withHeartbeat`, `maxDuration` adequado.
- **Query:** companies `platformProduct = 'VIS_MEDICAL'` **e** `domusClinicId IS NOT NULL` (só as vinculadas). O publisher é no-op para as não-vinculadas, mas filtrar evita trabalho à toa. Hoje ~2 companies.
- **Ação:** para cada company, `await publishEntitlementForCompany(cid)` com concorrência limitada (ex.: 5). Best-effort — o publisher nunca lança; falha residual cai no pull diário do Domus.
- **`vercel.json`:** adicionar `{ "path": "/api/cron/reconcile-entitlements", "schedule": "0 * * * *" }`. Precedente: `health-alert` e `plan-change-retry` já rodam `0 * * * *` em prod (Vercel Ready) → este projeto dispara crons horários de verdade (a nota antiga "Hobby=1×/dia" está desatualizada para este projeto).

**Por que republicar todas, sem rastrear "quem mudou":** enquanto a coorte medical é minúscula, varrer todas de hora em hora é barato e não exige mecanismo de captura. Republicar estado "já publicado" é idempotente e correto — o publisher relê fresco e o Domus ordena por `sourceRevision`, rejeitando revisão menor. Se a coorte crescer muito, a Fase 2 (outbox dirigido por evento) já é o mecanismo que dispensa a varredura; o cron então vira safety net raro ou é aposentado.

### 3.3 Testes Fase 1

- Handler de reconcile: auth fail-closed (sem/errado header → 401); itera **só** medical vinculadas (não toca não-VIS_MEDICAL nem sem `domusClinicId`); best-effort (falha de publish não derruba o handler).
- Os fixes inline já estão cobertos pela sua lógica; adicionar/confirmar teste do fluxo de acumulação+flush do dunning se ainda não existir.

---

## 4. Fase 2 — detalhe

### 4.1 Modelo do outbox (por-company, ponteiro)

```
EntitlementOutbox {
  companyId   TEXT         PRIMARY KEY    -- FK Company("id") ON DELETE CASCADE
  enqueuedAt  TIMESTAMPTZ  NOT NULL       -- carimbo do trigger; ordena drenagem + detecta re-enqueue
}
```

- **Só o ponteiro (companyId).** Nunca payload/status materializado. O worker recalcula o estado fresco na hora de publicar. Atende três requisitos inegociáveis da forja: (a) LGPD — nada de estado clínico parado numa fila; (b) evita entregar estado obsoleto; (c) coalesce N transições → 1 publish (PK companyId + upsert).
- **Sem GC, sem índice parcial "WHERE pending".** A linha existir *é* o pending. O worker deleta ao drenar com sucesso. `ON DELETE CASCADE` limpa órfãs se a company sumir.

### 4.2 Extensão do trigger (uma única mudança de função)

A função `bump_entitlement_revision(target_company_id)` (criada em `20260719140000`) já roda dentro de todo trigger de Subscription/Company, na mesma tx da mutação. `CREATE OR REPLACE FUNCTION` para adicionar, além do upsert em `EntitlementRevision`, o enqueue no outbox:

```sql
CREATE OR REPLACE FUNCTION "bump_entitlement_revision"(target_company_id TEXT)
RETURNS void AS $$
BEGIN
  IF target_company_id IS NULL THEN
    RETURN;
  END IF;
  -- relógio monotônico (inalterado)
  INSERT INTO "EntitlementRevision" ("companyId", "revision")
  VALUES (target_company_id, nextval('entitlement_revision_seq'))
  ON CONFLICT ("companyId")
  DO UPDATE SET "revision" = nextval('entitlement_revision_seq');
  -- NOVO: enqueue no outbox de publish (coalescente por company)
  INSERT INTO "EntitlementOutbox" ("companyId", "enqueuedAt")
  VALUES (target_company_id, now())
  ON CONFLICT ("companyId")
  DO UPDATE SET "enqueuedAt" = now();
END;
$$ LANGUAGE plpgsql;
```

- **Ponto único de mudança.** Todos os triggers já chamam essa função → a captura do outbox herda automaticamente a cobertura completa (INSERT/DELETE/UPDATE-de-campos-publicáveis em Subscription e Company) sem tocar em **nenhum** call-site da aplicação. Imune a client-split (`$use`/`$extends`), à reentrância de `checkSubscription`, e ao dilema pré/pós-escrita do `updateMany` (o trigger vê cada linha `FOR EACH ROW`).
- **`CREATE OR REPLACE FUNCTION` é metadata-only:** não recria triggers, não trava as tabelas-fonte com ACCESS EXCLUSIVE. **Não há `CREATE TRIGGER` novo** — os triggers existentes já apontam pra função e herdam a mudança.

### 4.3 Atomicidade

O INSERT no outbox commita junto com a mutação de negócio (mesmo trigger, mesma tx). Rollback do negócio → rollback do outbox (nunca há entrada fantasma). Commit do negócio → entrada garantida, durável, sobrevive a crash/freeze do serverless. É exatamente a garantia que o publish inline (best-effort) não dá.

### 4.4 Grants (preflight)

A função é `SECURITY INVOKER` → a role runtime (`DATABASE_URL`) que altera Company/Subscription precisa de `INSERT/UPDATE/DELETE` em `EntitlementOutbox` + `USAGE` na sequence (já concedida na V3a). Se `DATABASE_URL` e `DIRECT_URL` usam o mesmo owner (padrão Neon), já coberto. A migração concede o grant explicitamente por segurança. Se o runtime usa role restrita diferente, conceder **antes** — senão toda escrita de Company/Subscription falharia ao disparar o trigger. Mesmo preflight documentado em `20260719140000`.

### 4.5 O worker (drenagem)

- **Handler:** `GET /api/cron/drain-entitlement-outbox`. Bearer `CRON_SECRET` fail-closed, `withHeartbeat`, `maxDuration 300` (molde do `plan-change-retry`).
- **Loop:**
  1. Lê um batch do outbox ordenado por `enqueuedAt ASC` (ex.: 50 linhas): `(companyId, enqueuedAt)`.
  2. Para cada company: `await publishEntitlementForCompany(cid)` com concorrência limitada.
  3. **Delete condicional pós-sucesso:** `DELETE FROM "EntitlementOutbox" WHERE "companyId" = $1 AND "enqueuedAt" = $2`. Se o trigger re-enfileirou a company entre a leitura e o publish (nova transição), `enqueuedAt` avançou → o delete não casa → a linha fica → o próximo tick republica o estado ainda mais novo. Fecha a corrida "publiquei T1 mas T2 chegou durante o publish" sem perder T2.
  4. Falha de publish → **não deleta** → reprocessa no próximo tick (publisher best-effort/idempotente → repetir é seguro).
- **`vercel.json`:** `{ "path": "/api/cron/drain-entitlement-outbox", "schedule": "0 * * * *" }`. Começa horário (igual ao reconcile). Com a coorte pequena, o **publish inline** já entrega latência baixa; o outbox é a garantia durável que fecha a classe. Se no futuro precisar de propagação < 1h nos call-sites sem inline, aumentar frequência ou usar cron-job.org.

### 4.6 Invariante da spec (para ninguém "consertar")

Coalescer transições intermediárias é **correto** porque o Domus é espelho de estado puro: `EntitlementDTO.writeAllowed` segue o estado atual, sem side-effect por-transição. Publicar o estado final coalescido é semanticamente completo. ⚠️ **Se um dia o Domus ganhar auditoria/side-effect por-transição, o modelo por-company vira insuficiente** e este design precisa ser reavaliado (voltaria a ser outbox por-evento com GC). Escrito aqui explicitamente.

### 4.7 Migração e rollout Fase 2

- **Migração `prisma migrate deploy`** (nunca `migrate dev`/`db push` — `.env` = prod): (a) `CREATE TABLE EntitlementOutbox` + FK CASCADE; (b) grants à role runtime; (c) `CREATE OR REPLACE FUNCTION bump_entitlement_revision` com o enqueue.
- **Preflight:** `lock_timeout` curto; checar transações longas antes (mesmo que a V3a). `CREATE OR REPLACE FUNCTION` não trava tabelas-fonte, mas `CREATE TABLE` + grants são rápidos.
- **Aplicada com `!` pelo dono.** O classificador bloqueia `migrate deploy` corretamente; o dono autoriza escrita em prod.
- **Ordem de deploy:** migração (cria tabela + estende função) **antes** do código do worker. Se o worker subisse antes da tabela → quebraria. Se a função estende antes do worker existir → o outbox só acumula linhas inofensivas que ninguém drena ainda (pull diário + cron de reconcile cobrem o meio-tempo).
- **Runbook restore/PITR:** pós-restore o outbox pode ter órfãs de companies que sumiram → FK CASCADE limpa. Drenar um outbox pós-restore só republica estado atual (idempotente, seguro). A sequence de `EntitlementRevision` já tem runbook próprio (`docs/runbooks/runbook-entitlement-revision-restore.md`) — reseed acima do max que o Domus viu antes de repontar.

### 4.8 Testes Fase 2

- Worker: delete condicional por `enqueuedAt` (re-enqueue durante publish → linha permanece); batch; concorrência; reprocessa em falha; auth fail-closed.
- O trigger/função é SQL puro sem dev DB → validado no deploy (mesmo padrão dos triggers V3a: sem dev DB isolado neste projeto).
- Teste-invariante afirmando que coalescer é correto (o worker publica recalculando fresco, não o estado enfileirado).

---

## 5. Não-objetivos / fora de escopo

- **Não ligar `ENFORCE_VIS_ENTITLEMENTS`.** Permanece OFF. Este trabalho fecha o **canal de publish**; ligar o enforce é passo separado, só depois de o canal estar em prod e medido (0 clínicas seriam bloqueadas hoje; ver [[cadeado-publish-forja-panel]]).
- **Não mexer no receptor do Domus.** O parser/ordenação por `sourceRevision` (D1.2) já está em prod e cobre a idempotência do lado receptor.
- **Não refatorar os call-sites que já publicam inline** além dos 3 fixes já feitos. O outbox torna a publicação inline redundante-por-segurança, não obrigatória.

## 6. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Trigger enqueue falha → escrita de Subscription/Company falha | Grants no preflight; `INSERT ... ON CONFLICT` não pode violar unique (PK coalescente); função testada no deploy. |
| Corrida publish T1 vs re-enqueue T2 | Delete condicional por `enqueuedAt` (§4.5). |
| Estado obsoleto entregue | Ponteiro-não-payload; worker recalcula fresco; Domus rejeita revisão menor. |
| DDL trava prod | `CREATE OR REPLACE FUNCTION` metadata-only; `CREATE TABLE` rápido; `lock_timeout` + checar tx longa. |
| Restore/PITR | FK CASCADE limpa órfãs; drenagem idempotente; runbook da sequence. |
| Serverless corta publish inline | Outbox durável pega o que o inline perder (belt-and-suspenders). |

## 7. Ordem de execução

1. **Fase 1** → Codex revisa o diff (fixes já feitos + cron novo) → deploy (merge+push, sem migração). Alívio 24h→1h + hot path síncrono em prod.
2. **Fase 2** → Codex quebra o plano → implementa (migração + função + worker) → Codex revisa o diff → migração aplicada com `!` **antes** do código → deploy. Classe fechada de forma durável.
3. Enforce continua OFF. Medir e ligar é trabalho posterior.
