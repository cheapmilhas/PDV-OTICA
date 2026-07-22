# Cadeado — Canal de publish de entitlement Vis→Domus (design)

**Data:** 2026-07-22
**Status:** Design aprovado pelo dono; revisado adversarialmente pelo Codex (2 P0 + P1 incorporados). Aguardando 2ª volta do spec-reviewer.
**Risco:** ALTO (billing + multi-tenant + DDL de função/trigger contra banco de PROD + contrato cross-repo de revogação). Codex revisa a spec e cada fase do código. Lição do incidente 17/07 (banco zerado): migração só com `prisma migrate deploy`, nunca `migrate dev`/`db push`.
**Contexto:** [[cadeado-publish-forja-panel]], [[vis-tiers-emissao-forja]], [[vis-medical-cadeado-sprint2]].

## Changelog de revisão (Codex, 2026-07-22)

O Codex quebrou a v1 desta spec. Incorporado:
- **P0-A (decisão do dono: BLOQUEAR):** PAST_DUE publicava `writeAllowed:true` ao Domus embora o guard local do Vis bloqueie escrita (`readOnly:true`). Clínica inadimplente no grace period escrevia no Domus. → §3.0: projeção passa a `writeAllowed = allowed && !readOnly`.
- **P0-B (decisão do dono: REVOGAR o vínculo antigo):** o outbox por-company não revoga o entitlement órfão quando `domusClinicId A→B`, `A→NULL`, `platformProduct→VIS_APP`, ou a Company é deletada (não há trigger DELETE em Company). → §5: canal de revogação por-clinicId + trigger DELETE em Company. **Contrato cross-repo** (o Domus precisa aceitar um payload de revogação por clinicId).
- **P1 (worker cego a falha):** `publishEntitlementForCompany` retorna `void` e engole todo erro → o worker não distinguiria sucesso de falha e apagaria a linha mesmo em falha, furando a garantia durável. → §4.5: variante que retorna sucesso/falha; delete só em sucesso comprovado.
- **P1 (token frágil):** `enqueuedAt`/`now()` como versão do delete condicional é constante-por-tx, colide, e trunca micro→milissegundo entre Postgres e Prisma. → §4.1: token opaco `bigint` (reusa a sequence da revisão).
- **P1 (grants):** "USAGE já concedida" era falso (V3a não concedeu grant algum) e faltava nomear a role + `SELECT` pro worker. → §4.4 + o plano fixa a role e os statements exatos ANTES de escrever a migração.
- **P1 (limite da classe):** `ENFORCE_SUSPENSION`/`SUBSCRIPTION_BYPASS_COMPANY_IDS` mudam `writeAllowed` sem tocar tabela → sem revision/enqueue. → §2 (não-objetivos): documentado como limite aceito (mudança de ENV é operação rara; o cron de reconcile republica no próximo tick).
- **P2 (schema drift):** `EntitlementOutbox` precisa ir ao `schema.prisma` senão o próximo diff do Prisma propõe removê-la. → §4.7.
- **P2 (FK lock):** o `CREATE TABLE` tem FK pra Company → adquire lock na Company; não é "instantâneo sem lock". → §4.7 preflight.
- **Fato impreciso corrigido:** a v1 dizia que dunning/webhook fazem `updateMany` multi-tenant varrendo N companies — FALSO. dunning e webhook fazem `findMany`+iteração ou `updateMany` por `id`/`id+status`. O argumento de captura por trigger continua válido (imunidade a client-split + reentrância), mas sem essa premissa. → §1 corrigido.

---

## 1. Problema

O Domus (produto clínico) bloqueia escrita clínica por inadimplência **lendo o espelho de entitlement** que o Vis (operadora) publica. O DTO `writeAllowed` reflete o estado atual da assinatura/company da clínica.

Só **alguns** dos ~12 call-sites que mudam `Subscription.status` (ou `Company.isBlocked/accessEnabled`) publicam esse estado ao Domus. Os demais só chegam ao Domus no **pull diário de reparação (~24h)**. Consequência: uma clínica que fica inadimplente (ou volta a pagar) pode continuar bloqueada/liberada de forma errada por até 24h.

O Codex provou que isto é uma **classe**, não pontos isolados: corrigir call-site por call-site é whack-a-mole (3 fixes feitos manualmente, +3 achados na sequência). A solução tem de garantir que **toda** transição publicável propague, sem depender de lembrar de chamar o publisher em cada writer.

### Fatos do código que fundamentam o design (verificados, não especulados)

- **O publisher revalida tudo por companyId.** `buildEntitlementPayload(companyId)` (`src/lib/vis-domus-publisher.ts:54`) relê Company + Subscription + `checkSubscription` + `EntitlementRevision` numa tx REPEATABLE READ. `writeAllowed`/tier/status/revision vêm da releitura fresca, **não** do estado que a mutação carregava. Único risco = "entregar companyId errado/nenhum"; nunca vaza cross-tenant (no-op se não-VIS_MEDICAL ou sem `domusClinicId`, `:101`). Isso torna "republicar por companyId" seguro e idempotente.
- **O `prisma` global usa `$use` (tenant-guard + audit), não `$extends`.** Um interceptor via `$extends` cria client derivado; os ~9 writers de Subscription usam o `prisma` base → passariam por fora. Captura app-level via `$extends` está **morta**.
- **`checkSubscription` (`src/lib/subscription.ts:160`) é ele próprio um writer** (`updateMany` TRIAL→TRIAL_EXPIRED) e roda dentro do publish. Interceptor app-level no Subscription se auto-dispararia (reentrância).
- **Os writers de status têm formas heterogêneas de where:** webhook Asaas (`route.ts:265`) faz `updateMany` por `id` (PK); dunning faz `findMany`+iteração atualizando uma sub por vez (`dunning/route.ts:58/84`); subscription-watch faz `updateMany` por `id+status` (`:80`); `checkSubscription` faz `updateMany` TRIAL→TRIAL_EXPIRED por `status`. A captura por **trigger `FOR EACH ROW`** é imune a essa heterogeneidade — ela vê cada linha individual independente da forma do statement, sem precisar extrair companyId do where. (A v1 desta spec afirmava incorretamente que dunning/webhook varriam N tenants num único `updateMany`; corrigido — o argumento de captura por trigger não depende disso.)
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

### 3.0 Correção de projeção: PAST_DUE → writeAllowed:false (P0-A, decisão do dono)

**Antes:** `projectEntitlement` fazia `writeAllowed = input.allowed` (`src/lib/entitlement-projection.ts:32`). Para PAST_DUE, `checkSubscription` retorna `allowed:true, readOnly:true` (`src/lib/subscription.ts:210`) — o cliente inadimplente no grace period pode LER mas não escrever. O guard local do Vis bloqueia escrita em `!allowed || readOnly` (`subscription.ts:284`), MAS a projeção pro Domus só carregava `allowed` → o Domus recebia `writeAllowed:true` e a clínica inadimplente **escrevia normalmente no Domus durante todo o grace period**, enquanto estava bloqueada de escrever no Vis.

**Depois (decisão do dono — espelhar o Vis):** a projeção passa a incluir `readOnly` no input e computar `writeAllowed = allowed && !readOnly`. PAST_DUE → `writeAllowed:false`. Os dois produtos ficam coerentes: inadimplente no grace period para de escrever nos dois.

- Mudança: `EntitlementInput` ganha `readOnly: boolean`; `projectEntitlement` computa `writeAllowed = allowed && !readOnly`. `buildEntitlementPayload` já tem `decision.readOnly` disponível (é o `SubscriptionCheckResult` inteiro) — passar adiante.
- **Impacto no relógio:** essa mudança NÃO altera quando o trigger dispara (o status/campos publicáveis são os mesmos); só muda o VALOR de `writeAllowed` no payload. A transição ACTIVE→PAST_DUE já bumpa a revisão (status mudou) → o Domus recebe o novo `writeAllowed:false` com revisão maior. OK.
- **Deploy:** parte da Fase 1 (mudança pura de projeção, sem migração). Vai a prod junto com os fixes + cron.
- **Teste:** `projectEntitlement` com `{allowed:true, readOnly:true}` → `writeAllowed:false`; com `{allowed:true, readOnly:false}` → `true`; com `{allowed:false}` → `false`. Atualizar os testes existentes da projeção que assumiam `writeAllowed=allowed`.

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

### 4.1 Modelo do outbox (por-company, ponteiro, token opaco)

```
EntitlementOutbox {
  companyId  TEXT    PRIMARY KEY    -- FK Company("id") ON DELETE CASCADE
  seq        BIGINT  NOT NULL       -- token opaco de versão; nextval da MESMA sequence da revisão
}
```

- **Só o ponteiro (companyId).** Nunca payload/status materializado. O worker recalcula o estado fresco na hora de publicar. Atende três requisitos inegociáveis da forja: (a) LGPD — nada de estado clínico parado numa fila; (b) evita entregar estado obsoleto; (c) coalesce N transições → 1 publish (PK companyId + upsert).
- **Token de versão = `seq` (bigint), NÃO `enqueuedAt` (P1 do Codex).** O delete condicional do worker precisa distinguir "a linha que li" de "uma re-enfileirada durante meu publish". `now()` NÃO serve: é constante durante toda a transação (dois enqueues na mesma tx compartilham o timestamp), pode colidir entre transações, e sofre truncamento micro→milissegundo entre `TIMESTAMPTZ` (Postgres) e `Date`/`getTime()` (Prisma/JS, ver `vis-domus-publisher.ts:148`) — o `WHERE seq = ?` nunca casaria. Um `bigint` monotônico da sequence é opaco, estritamente crescente, e sobrevive à serialização Prisma como `BigInt`→string sem perda. Reusa a **mesma** `entitlement_revision_seq` já existente (o enqueue faz `nextval` uma vez e usa o valor para as duas escritas — revisão e outbox — mantendo-os alinhados; ver §4.2).
- **Sem GC, sem índice parcial "WHERE pending".** A linha existir *é* o pending. O worker deleta ao drenar com sucesso. `ON DELETE CASCADE` limpa órfãs se a company sumir.

### 4.2 Extensão do trigger (uma única mudança de função)

A função `bump_entitlement_revision(target_company_id)` (criada em `20260719140000`) já roda dentro de todo trigger de Subscription/Company, na mesma tx da mutação. `CREATE OR REPLACE FUNCTION` para adicionar, além do upsert em `EntitlementRevision`, o enqueue no outbox:

```sql
CREATE OR REPLACE FUNCTION "bump_entitlement_revision"(target_company_id TEXT)
RETURNS void AS $$
DECLARE
  new_seq BIGINT;
BEGIN
  IF target_company_id IS NULL THEN
    RETURN;
  END IF;
  -- Um único nextval alimenta revisão E outbox (mantém os dois alinhados).
  new_seq := nextval('entitlement_revision_seq');
  -- relógio monotônico (comportamento inalterado; só a fonte do valor mudou)
  INSERT INTO "EntitlementRevision" ("companyId", "revision")
  VALUES (target_company_id, new_seq)
  ON CONFLICT ("companyId")
  DO UPDATE SET "revision" = new_seq;
  -- NOVO: enqueue no outbox de publish (coalescente por company; token = seq)
  INSERT INTO "EntitlementOutbox" ("companyId", "seq")
  VALUES (target_company_id, new_seq)
  ON CONFLICT ("companyId")
  DO UPDATE SET "seq" = new_seq;
END;
$$ LANGUAGE plpgsql;
```

**Nota sobre a mudança de fonte do valor da revisão:** antes eram dois `nextval` (um no INSERT, outro no `DO UPDATE`); agora é um só `nextval` reusado. Isso é semanticamente equivalente para a monotonicidade (cada chamada da função consome ≥1 valor e a revisão sempre cresce) e não muda o contrato com o Domus. O plano deve confirmar que nenhum consumidor depende do valor absoluto da revisão (só da ordem) — e depende só da ordem (`vis-entitlement-sync.ts` ordena por `<=`).

- **Ponto único de mudança.** Todos os triggers já chamam essa função → a captura do outbox herda automaticamente a cobertura completa (INSERT/DELETE/UPDATE-de-campos-publicáveis em Subscription e Company) sem tocar em **nenhum** call-site da aplicação. Imune a client-split (`$use`/`$extends`), à reentrância de `checkSubscription`, e ao dilema pré/pós-escrita do `updateMany` (o trigger vê cada linha `FOR EACH ROW`).
- **`CREATE OR REPLACE FUNCTION` é metadata-only:** não recria triggers, não trava as tabelas-fonte com ACCESS EXCLUSIVE. **Não há `CREATE TRIGGER` novo** — os triggers existentes já apontam pra função e herdam a mudança.

### 4.3 Atomicidade

O INSERT no outbox commita junto com a mutação de negócio (mesmo trigger, mesma tx). Rollback do negócio → rollback do outbox (nunca há entrada fantasma). Commit do negócio → entrada garantida, durável, sobrevive a crash/freeze do serverless. É exatamente a garantia que o publish inline (best-effort) não dá.

### 4.4 Grants (preflight) — P1 do Codex

A função é `SECURITY INVOKER` → a role runtime (`DATABASE_URL`) que altera Company/Subscription executa o corpo com os PRÓPRIOS privilégios. Precisa de:
- `INSERT`, `UPDATE`, `DELETE` em `EntitlementOutbox` (o trigger insere/upserta; o worker deleta).
- `SELECT` em `EntitlementOutbox` (o worker lê o batch) — **o Codex apontou que a v1 omitiu isto**.
- `USAGE` em `entitlement_revision_seq` — **a v1 dizia "já concedida na V3a", o que é FALSO: a migração `20260719140000` NÃO concede grant algum** (assume mesmo owner Neon). Conceder explicitamente agora.

**O plano DEVE resolver a role runtime exata ANTES de escrever a migração** (não durante). Verificar se `DATABASE_URL` e `DIRECT_URL` usam o mesmo owner (padrão Neon → tudo coberto). Se o runtime usa role restrita diferente, os grants têm de nomeá-la corretamente — um grant errado/ausente faz **toda escrita de Company/Subscription falhar no trigger** (maior blast radius desta spec). O `CREATE OR REPLACE FUNCTION` não prova que a role consegue executar o corpo — erro de permissão só apareceria no primeiro trigger real. Mitigação: após aplicar a migração, rodar um write de teste controlado (ex.: `UPDATE Company SET updatedAt=updatedAt WHERE id=<uma medical> `) e confirmar que o outbox recebeu a linha, ANTES de considerar o deploy bom.

### 4.5 O worker (drenagem)

**Pré-requisito (P1 do Codex): um publisher que SINALIZA sucesso/falha.** `publishEntitlementForCompany` hoje retorna `Promise<void>` e engole TODO erro (config ausente, payload null, HTTP 4xx/5xx, timeout, exceção de rede — `vis-domus-publisher.ts:198/209/231/238`). Se o worker chamasse essa versão, não distinguiria sucesso de falha e apagaria a linha **mesmo em falha** — furando a garantia durável que justifica o outbox inteiro. A Fase 2 adiciona uma variante:

```ts
type PublishResult =
  | { kind: "published" }         // 2xx confirmado do Domus
  | { kind: "noop" }              // company não-medical/sem vínculo — nada a publicar (deletar do outbox: correto)
  | { kind: "failed"; reason: string }; // rede/HTTP-erro/config ausente — NÃO deletar, retry no próximo tick

export async function tryPublishEntitlementForCompany(companyId: string): Promise<PublishResult>;
```

`publishEntitlementForCompany` (best-effort, void) permanece para os call-sites inline (não devem depender do resultado). O worker usa a variante `try…`. Notar: `noop` é sucesso do ponto de vista do outbox — a company não produz publish (ex.: virou VIS_APP), então a linha deve sair. `failed` inclui config ausente (sem secret/url): nesse caso o worker mantém a linha (quando o env voltar, drena) — mas registra métrica para não mascarar env quebrado indefinidamente.

- **Handler:** `GET /api/cron/drain-entitlement-outbox`. Bearer `CRON_SECRET` fail-closed, `withHeartbeat`, `maxDuration 300` (molde do `plan-change-retry`).
- **Loop:**
  1. Lê um batch ordenado por `seq ASC` (ex.: 50 linhas): `(companyId, seq)`. Query simples `SELECT ... ORDER BY seq ASC LIMIT 50` — **sem** `FOR UPDATE SKIP LOCKED`: só há UM worker (cron horário único), execuções concorrentes não são esperadas nem guardadas. O plano registra isso explicitamente para ninguém assumir semântica de fila multi-consumidor.
  2. Para cada company: `const r = await tryPublishEntitlementForCompany(cid)` com concorrência limitada.
  3. **Delete condicional por `seq` (só em `published`|`noop`):** `DELETE FROM "EntitlementOutbox" WHERE "companyId" = $1 AND "seq" = $2`. Se o trigger re-enfileirou a company entre a leitura e o publish (nova transição), `seq` avançou (nextval estritamente crescente) → o delete não casa → a linha fica → o próximo tick republica o estado ainda mais novo. Fecha a corrida "publiquei estado do seq S, mas S+1 chegou durante o publish" sem perder S+1. O token opaco (não timestamp) elimina colisão e truncamento.
  4. `failed` → **não deleta** → reprocessa no próximo tick (a variante `try…` reconstrói o payload fresco; repetir é idempotente).
- **`vercel.json`:** `{ "path": "/api/cron/drain-entitlement-outbox", "schedule": "0 * * * *" }`. Começa horário (igual ao reconcile). Com a coorte pequena, o **publish inline** já entrega latência baixa; o outbox é a garantia durável que fecha a classe. Se no futuro precisar de propagação < 1h nos call-sites sem inline, aumentar frequência ou usar cron-job.org.

### 4.6 Invariante da spec (para ninguém "consertar")

Coalescer transições intermediárias é **correto** porque o Domus é espelho de estado puro: `EntitlementDTO.writeAllowed` segue o estado atual, sem side-effect por-transição. Publicar o estado final coalescido é semanticamente completo. ⚠️ **Se um dia o Domus ganhar auditoria/side-effect por-transição, o modelo por-company vira insuficiente** e este design precisa ser reavaliado (voltaria a ser outbox por-evento com GC). Escrito aqui explicitamente.

### 4.7 Migração e rollout Fase 2

- **Espelhar `EntitlementOutbox` no `schema.prisma` (P2 do Codex):** hoje só `EntitlementRevision` está no schema. Sem o modelo, o próximo `prisma migrate dev`/diff veria drift e proporia **remover** a tabela criada por SQL cru. Adicionar o `model EntitlementOutbox` ao schema (mesmo que o worker use `$queryRaw`), consistente com como `EntitlementRevision` foi tratada.
- **Migração `prisma migrate deploy`** (nunca `migrate dev`/`db push` — `.env` = prod): (a) `CREATE TABLE EntitlementOutbox` (`companyId` PK, `seq` bigint) + FK CASCADE pra Company; (b) grants à role runtime (§4.4); (c) `CREATE OR REPLACE FUNCTION bump_entitlement_revision` com o enqueue por `seq`.
- **Preflight:** `lock_timeout` curto; checar transações longas antes (mesmo que a V3a). `CREATE OR REPLACE FUNCTION` NÃO trava as tabelas-fonte. **Mas o `CREATE TABLE` com FK pra Company adquire lock na Company** (P2 do Codex — a v1 dizia "CREATE TABLE rápido" ignorando isto): o FK precisa validar contra a tabela referenciada e enfileira atrás de tx longas em Company. Com Company minúscula neste projeto (15 linhas) e `lock_timeout` curto, o risco é baixo, mas o plano deve medir/checar tx longas em Company antes, não assumir.
- **Aplicada com `!` pelo dono.** O classificador bloqueia `migrate deploy` corretamente; o dono autoriza escrita em prod.
- **Ordem de deploy:** migração (cria tabela + estende função) **antes** do código do worker. Se o worker subisse antes da tabela → quebraria. Se a função estende antes do worker existir → o outbox só acumula linhas inofensivas que ninguém drena ainda (pull diário + cron de reconcile cobrem o meio-tempo).
- **Migração parcial (P2 do Codex):** `migrate deploy` não envolve o arquivo em 1 tx. Se falhar entre o `CREATE TABLE` e o `CREATE OR REPLACE FUNCTION`, o Prisma marca a migration como falha e exige resolução explícita antes do próximo deploy. Estado observável: tabela existe, função ainda é a antiga (não enfileira) — inofensivo (nada quebra; o reconcile/pull cobrem). Runbook: resolver a migration (`prisma migrate resolve`) e reaplicar; a migração é idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE`, grants idempotentes).
- **Runbook restore/PITR:** pós-restore o outbox pode ter órfãs de companies que sumiram → FK CASCADE limpa. Drenar um outbox pós-restore só republica estado atual (idempotente, seguro). A sequence de `EntitlementRevision` já tem runbook próprio (`docs/runbooks/runbook-entitlement-revision-restore.md`) — reseed acima do max que o Domus viu antes de repontar. Como o outbox usa a MESMA sequence, o mesmo reseed cobre os dois.

### 4.8 Testes Fase 2

- `tryPublishEntitlementForCompany`: retorna `published` no 2xx; `noop` quando company não-medical/sem vínculo; `failed` em HTTP-erro/timeout/config-ausente (mockar o fetch/env). O worker só deleta em `published`|`noop`.
- Worker: delete condicional por `seq` (re-enqueue com `seq` maior durante publish → linha permanece, não perde o estado novo); batch ordenado por `seq`; concorrência; `failed` → não deleta → reprocessa; auth fail-closed.
- O trigger/função é SQL puro sem dev DB → validado no deploy (mesmo padrão dos triggers V3a: sem dev DB isolado neste projeto) + o write de teste controlado pós-migração (§4.4) confirma que o enqueue funciona com a role runtime real.
- Teste-invariante afirmando que coalescer é correto (o worker publica recalculando fresco, não o estado enfileirado).

---

## 5. Fase 3 — revogação do vínculo órfão (P0-B, contrato cross-repo)

O outbox por-company (§4) só sabe republicar o estado ATUAL de uma company. Ele NÃO revoga o entitlement que fica órfão no Domus quando o VÍNCULO some ou muda de dono. Cenários (todos confirmados no código):

- **`domusClinicId A→B`** (a company troca de clínica): o trigger enfileira a company → o worker publica o estado de **B**. Mas o Domus continua com o entitlement de **A** liberado. A clínica A escreve indevidamente.
- **`domusClinicId A→NULL`** ou **`platformProduct VIS_MEDICAL→VIS_APP`**: `buildEntitlementPayload` retorna `null` (`vis-domus-publisher.ts:101`) → o worker faz `noop` e deleta a linha, sem nunca revogar A. O pull do Domus também deixa A de fora (404, `entitlements/[clinicId]/route.ts:42`) — mas 404 no pull NÃO é sinal de revogação; o Domus preserva o último entitlement (comportamento `COALESCE-like`, `vis-entitlement-sync.ts:207`). A escreve indefinidamente.
- **DELETE físico de Company:** não existe trigger `AFTER DELETE ON "Company"` (confirmado: a migração `20260719140000` só tem DELETE em Subscription). O FK `ON DELETE CASCADE` do outbox apenas **apaga** a linha pendente — não gera revogação. A some sem nunca ser revogada.

Isto é um **buraco cross-tenant**: uma clínica desvinculada/reassociada continua com escrita liberada no Domus.

### 5.1 Design da revogação (decisão do dono: capturar clinicId antigo + revogar)

**Captura do vínculo antigo por trigger.** O trigger de UPDATE de Company já dispara quando `domusClinicId` muda (está no `WHEN`). Estender a função do trigger de Company (ou uma função dedicada) para, quando `OLD.domusClinicId IS DISTINCT FROM NEW.domusClinicId AND OLD.domusClinicId IS NOT NULL`, enfileirar o **clinicId antigo** num canal de revogação:

```
EntitlementRevocationOutbox {
  domusClinicId  TEXT    PRIMARY KEY   -- o clinicId que perdeu o vínculo
  seq            BIGINT  NOT NULL      -- mesmo esquema de token opaco
}
```

Casos que enfileiram revogação de `OLD.domusClinicId`:
- UPDATE de Company com `domusClinicId` mudando (A→B, A→NULL) e `OLD.domusClinicId` não-nulo.
- UPDATE de `platformProduct VIS_MEDICAL→VIS_APP` com `domusClinicId` não-nulo (deixa de ser medical).
- **DELETE de Company** — exige um trigger `AFTER DELETE ON "Company"` NOVO (não existe): se `OLD.platformProduct = 'VIS_MEDICAL' AND OLD.domusClinicId IS NOT NULL`, enfileira revogação de `OLD.domusClinicId`. ⚠️ o outbox de publish (§4) tem FK CASCADE que apagaria a linha da company deletada — o de revogação é chaveado por `domusClinicId` (não `companyId`), então **não** cascateia junto; sobrevive ao delete da Company. Correto.

**Worker de revogação.** Pode ser o MESMO handler `drain-entitlement-outbox` (drena os dois outboxes) ou um segundo cron. Para cada `domusClinicId` revogado: publica ao Domus um **payload de revogação** — `writeAllowed:false, reason:"UNLINKED"` — chaveado só pelo `domusClinicId` (não há company viva para reconstruir o resto). Delete condicional por `seq`, igual ao §4.5.

### 5.2 Contrato cross-repo (o Domus precisa aceitar revogação)

O receptor atual do Domus espera um payload completo (visCompanyId, plan.tier em v2, sourceRevision) reconstruído de uma company viva. Um payload de revogação **não tem company** — é só `{domusClinicId, writeAllowed:false, reason:"UNLINKED", sourceRevision}`. **O Domus precisa de uma rota/branch que aceite esse formato e grave `writeAllowed:false` para aquele clinicId**, respeitando o `sourceRevision` monotônico (senão um publish v2 atrasado da company B poderia... não — B tem clinicId diferente; a revogação de A não colide com B). Isto é trabalho **no outro repo** (`~/SISTEMACLINICADOMUS`), como toda a saga D1. Sub-fase própria, planejada e quebrada pelo Codex do lado Domus.

**Ordem:** Fase 3 depende do Domus aceitar revogação PRIMEIRO (receiver-first, igual ao D1). Enquanto o contrato Domus não existir, a Fase 3 do Vis não emite — o buraco fica coberto por **runbook manual** (admin revoga no Domus na mão nas raras operações de desvínculo). Hoje são ~2 companies com vínculo estável, então o buraco é teórico até haver reassociação real.

## 6. Não-objetivos / fora de escopo

- **Não ligar `ENFORCE_VIS_ENTITLEMENTS`.** Permanece OFF. Este trabalho fecha o **canal de publish**; ligar o enforce é passo separado, só depois de o canal estar em prod e medido (0 clínicas seriam bloqueadas hoje; ver [[cadeado-publish-forja-panel]]).
- **Limite conhecido — mudanças de ENV não disparam o canal (P1 do Codex):** `ENFORCE_SUSPENSION` e `SUBSCRIPTION_BYPASS_COMPANY_IDS` (`subscription.ts:50/61`) alteram o resultado de `writeAllowed` sem tocar Company/Subscription/EntitlementRevision → não geram revisão nem enqueue. Uma mudança dessas envs em prod NÃO propaga automaticamente até o próximo bump ou o próximo tick do cron de reconcile (§3.2, que republica toda a coorte de hora em hora). Aceito: mudança de ENV é operação rara/operacional; o reconcile horário cobre em ≤1h. Documentado para não ser confundido com bug do canal.
- **Não mexer no receptor do Domus** exceto pela revogação (§5.2). O parser/ordenação por `sourceRevision` (D1.2) já está em prod e cobre a idempotência do lado receptor para os publishes normais.
- **Não refatorar os call-sites que já publicam inline** além dos 3 fixes já feitos. O outbox torna a publicação inline redundante-por-segurança, não obrigatória.

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Trigger enqueue falha por falta de grant → escrita de Subscription/Company falha (maior blast radius) | Grants explícitos nomeando a role (§4.4); write de teste controlado pós-migração antes de dar o deploy por bom. |
| Worker apaga linha em falha (P1) | `tryPublishEntitlementForCompany` sinaliza `published`/`noop`/`failed`; delete só em sucesso (§4.5). |
| Corrida publish seq S vs re-enqueue S+1 | Delete condicional por `seq` opaco monotônico (§4.5). |
| PAST_DUE escreve no Domus (P0-A) | Projeção `writeAllowed = allowed && !readOnly` (§3.0). |
| Clínica órfã escreve após desvínculo/reassociação/delete (P0-B) | Canal de revogação por-clinicId + trigger DELETE em Company (§5); runbook manual até o Domus aceitar revogação. |
| Estado obsoleto entregue | Ponteiro-não-payload; worker recalcula fresco; Domus rejeita revisão menor. |
| DDL trava prod | `CREATE OR REPLACE FUNCTION` não trava fonte; `CREATE TABLE` com FK adquire lock em Company (Company minúscula + `lock_timeout` + checar tx longa, §4.7). |
| Migração parcial | Estado inofensivo (tabela sem função = não enfileira); migração idempotente, `prisma migrate resolve` + reaplicar (§4.7). |
| Restore/PITR | FK CASCADE limpa órfãs; drenagem idempotente; mesma sequence → mesmo reseed do runbook da revisão. |
| Serverless corta publish inline | Outbox durável pega o que o inline perder (belt-and-suspenders). |
| Mudança de ENV não propaga | Limite aceito; cron de reconcile republica a coorte em ≤1h (§6). |

## 8. Ordem de execução

1. **Fase 1** (baixo risco, sem migração) → Codex revisa o diff (correção de projeção PAST_DUE + 3 fixes inline + cron de reconcile) → deploy (merge+push). Fecha o P0-A + alívio 24h→1h + hot path síncrono em prod.
2. **Fase 2** (alto risco, migração) → Codex quebra o plano → implementa (schema.prisma + migração função/tabela + `tryPublish…` + worker) → Codex revisa o diff → **resolver a role runtime e os grants ANTES da migração** → migração aplicada com `!` **antes** do código → write de teste controlado → deploy. Fecha a classe de forma durável.
3. **Fase 3** (contrato cross-repo, receiver-first) → primeiro o Domus aceita revogação por-clinicId (planejado/quebrado pelo Codex do lado Domus) → depois o Vis emite (trigger de revogação + trigger DELETE Company + worker de revogação). Fecha o P0-B. Até lá, runbook manual cobre o desvínculo raro.
4. Enforce (`ENFORCE_VIS_ENTITLEMENTS`) continua OFF durante tudo. Medir e ligar é trabalho posterior, só depois do canal fechado em prod.
