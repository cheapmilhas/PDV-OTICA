# Cadeado — Canal de publish Vis→Domus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a classe "toda mudança de `Subscription.status`/Company block precisa publicar `writeAllowed` ao Domus", eliminando a janela de ~24h em que uma clínica inadimplente/desvinculada continua escrevendo no Domus.

**Architecture:** Três fases deployáveis independentes. Fase 1 (sem migração): corrige a projeção de PAST_DUE + os 3 fixes inline já feitos + um cron de reconcile horário. Fase 2 (migração): estende o trigger de banco `bump_entitlement_revision` para gravar num outbox durável por-company (token opaco `seq`), drenado por um worker que sinaliza sucesso/falha. Fase 3 (cross-repo, receiver-first): revoga o entitlement órfão quando o vínculo clínica↔company some (trigger de revogação + trigger DELETE em Company + worker).

**Tech Stack:** Next.js 16 (App Router), Prisma + Neon Postgres, Vitest, TypeScript. Multi-tenant por `companyId`.

**Environment notes:**
- **NUNCA** rodar `prisma migrate dev` ou `prisma db push` — o `.env` local aponta pro banco de PROD (lição do incidente 17/07 que zerou o banco). Migração só via `./node_modules/.bin/prisma migrate deploy`, aplicada pelo DONO com `!`.
- O `rtk` hook quebra `npx` → usar `./node_modules/.bin/` nos binários.
- Deploy é MANUAL: `merge --no-ff` em main + `git push origin main` dispara auto-deploy Vercel do Vis. Migração ANTES do deploy do código.
- Flag `ENFORCE_VIS_ENTITLEMENTS` fica **OFF** durante todo este plano. Não ligar.
- Alto risco (billing + multi-tenant + DDL em prod) → **Codex revisa cada fase** (MCP `codex`, read-only) antes do merge. Máximo 2 rodadas por fase.
- Branch de trabalho: `feat/cadeado-canal-publish` (já criada de `origin/main`, contém a spec + os 2 fixes inline no working tree).

**Spec:** `docs/superpowers/specs/2026-07-22-cadeado-publish-canal-design.md`

---

## FASE 1 — Correção PAST_DUE + fixes inline + cron de reconcile (sem migração)

### Task 1.1: Projeção — PAST_DUE deixa de liberar escrita no Domus (P0-A)

**Files:**
- Modify: `src/lib/entitlement-projection.ts`
- Test: `src/lib/__tests__/entitlement-projection.test.ts`

Contexto: hoje `projectEntitlement` faz `writeAllowed = input.allowed`. Para PAST_DUE, `checkSubscription` (`src/lib/subscription.ts:210`) retorna `allowed:true, readOnly:true` — o guard local do Vis bloqueia escrita (`!allowed || readOnly`), mas a projeção só carregava `allowed` → o Domus recebia `writeAllowed:true`. A correção: `writeAllowed = allowed && !readOnly`.

- [ ] **Step 1: Atualizar os testes existentes para a nova semântica**

Os testes atuais assumem `writeAllowed = allowed`. Substituir o bloco PAST_DUE e a blindagem. Editar `src/lib/__tests__/entitlement-projection.test.ts`:

Trocar o teste da linha 24-26:
```typescript
  it("PAST_DUE (readOnly) → NÃO escreve no Domus (espelha o guard local do Vis)", () => {
    // checkSubscription retorna allowed:true, readOnly:true no grace period.
    // O guard local bloqueia escrita; a projeção pro Domus tem de espelhar isso.
    const r = projectEntitlement({ ...base, allowed: true, readOnly: true, status: "PAST_DUE" });
    expect(r.writeAllowed).toBe(false);
    expect(r.subscriptionStatus).toBe("PAST_DUE");
  });
```

Trocar a blindagem da linha 54-58 (agora `writeAllowed = allowed && !readOnly`):
```typescript
  it("writeAllowed = allowed && !readOnly (readOnly corta a escrita mesmo com allowed)", () => {
    expect(projectEntitlement({ allowed: true, readOnly: false, status: "ACTIVE" }).writeAllowed).toBe(true);
    expect(projectEntitlement({ allowed: true, readOnly: true, status: "PAST_DUE" }).writeAllowed).toBe(false);
    expect(projectEntitlement({ allowed: false, readOnly: false, status: "SUSPENDED" }).writeAllowed).toBe(false);
  });
```

Nos demais testes que passam `allowed` sem `readOnly`, adicionar `readOnly: false` explícito nos que esperam `writeAllowed:true` (ACTIVE, TRIAL, robustez ACTIVE). Os que esperam `false` por `allowed:false` não precisam (o `&&` já dá false).

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/entitlement-projection.test.ts`
Expected: FAIL — `projectEntitlement` ainda não aceita `readOnly` e ainda faz `writeAllowed = allowed` (PAST_DUE dá `true`, esperado `false`).

- [ ] **Step 3: Implementar a mudança na projeção**

Editar `src/lib/entitlement-projection.ts`. No `interface EntitlementInput`, adicionar o campo:
```typescript
  /** readOnly de SubscriptionCheckResult — PAST_DUE dá allowed:true+readOnly:true. */
  readOnly?: boolean;
```

E em `projectEntitlement`, trocar `writeAllowed: input.allowed` por:
```typescript
    // writeAllowed espelha o guard local do Vis: bloqueia se !allowed OU readOnly
    // (PAST_DUE no grace period). Sem isto, a clínica inadimplente escreveria no
    // Domus enquanto está bloqueada de escrever no Vis (P0-A da spec cadeado).
    writeAllowed: input.allowed && !input.readOnly,
```

- [ ] **Step 4: Passar `readOnly` no publisher**

Em `src/lib/vis-domus-publisher.ts`, na função `assemblePayload` (~linha 140), o `projectEntitlement` recebe `{ allowed, status, planName }`. Adicionar `readOnly`:
```typescript
  const dto = projectEntitlement({
    allowed: decision.allowed,
    readOnly: decision.readOnly,
    status: decision.status,
    planName: decision.planName ?? sub?.plan?.name,
  });
```
(`decision` é o `SubscriptionCheckResult`; confirmar que tem `readOnly` — `subscription.ts` retorna `readOnly` em todos os ramos.)

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/entitlement-projection.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Rodar os testes do publisher (não regrediram)**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/vis-domus-publisher.test.ts`
Expected: PASS. Se algum teste do publisher assumia `writeAllowed:true` para PAST_DUE, atualizar para `false` (o publisher agora projeta corretamente).

- [ ] **Step 7: Commit**

```bash
git add src/lib/entitlement-projection.ts src/lib/vis-domus-publisher.ts src/lib/__tests__/entitlement-projection.test.ts
git commit -m "fix(cadeado): PAST_DUE nao libera escrita no Domus (writeAllowed = allowed && !readOnly)"
```

### Task 1.2: Commitar os 3 fixes inline já no working tree

**Files:**
- Modify (já modificados, não commitados): `src/app/api/cron/dunning/route.ts`, `src/app/api/webhooks/asaas/route.ts`

Contexto: os fixes já estão no working tree, revisados contra o Codex (dunning acumula companies num Set e publica ao final com await+concorrência 5; webhook publica com await em payment-confirmed→unblock e cancel→block). Não reescrever — só commitar.

- [ ] **Step 1: Conferir o diff dos fixes**

Run: `git diff src/app/api/cron/dunning/route.ts src/app/api/webhooks/asaas/route.ts`
Expected: dunning importa `publishEntitlementForCompany`, cria `Set<string>`, adiciona `sub.companyId` nos ramos SUSPENDED/CANCELED, e faz flush await+concorrência 5 no final; webhook importa e faz `await publishEntitlementForCompany(companyId)` em payment-confirmed e em cancel. Nenhum outro arquivo tocado.

- [ ] **Step 2: Rodar o typechecker**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Rodar testes que tocam dunning/webhook, se existirem**

Run: `./node_modules/.bin/vitest run src/app/api/cron/dunning src/app/api/webhooks/asaas 2>/dev/null || echo "sem testes dedicados — OK"`
Expected: PASS ou "sem testes dedicados".

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/dunning/route.ts src/app/api/webhooks/asaas/route.ts
git commit -m "fix(cadeado): propaga writeAllowed ao Domus na hora (dunning suspend/cancel + webhook pay/cancel)"
```

### Task 1.3: Cron de reconcile horário

**Files:**
- Create: `src/app/api/cron/reconcile-entitlements/route.ts`
- Modify: `vercel.json`
- Test: `src/app/api/cron/reconcile-entitlements/__tests__/route.test.ts`

Contexto: backstop de reparação do lado Vis. Republica de hora em hora a coorte medical vinculada, cobrindo call-sites que não têm publish inline. Best-effort. Auth Bearer `CRON_SECRET` fail-closed. Padrão: ver outro cron existente para o formato de auth/heartbeat.

- [ ] **Step 1: Ler o molde de um cron existente (auth + heartbeat)**

Run: `sed -n '1,60p' src/app/api/cron/plan-change-retry/route.ts`
Expected: ver como faz Bearer `CRON_SECRET` fail-closed, `withHeartbeat`, `maxDuration`. Copiar exatamente esse padrão de auth (não inventar).

- [ ] **Step 2: Escrever o teste do handler (auth + escopo)**

Criar `src/app/api/cron/reconcile-entitlements/__tests__/route.test.ts`. O teste deve cobrir: (a) sem/errado Bearer → 401; (b) com Bearer certo, chama `publishEntitlementForCompany` só para companies VIS_MEDICAL com `domusClinicId != null`; (c) falha de publish não derruba o handler (best-effort). Mockar `@/lib/prisma` (query de companies) e `@/lib/vis-domus-publisher` (`publishEntitlementForCompany`). Espelhar o mock de `CRON_SECRET` do teste do `plan-change-retry` se houver. Estrutura:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/vis-domus-publisher", () => ({
  publishEntitlementForCompany: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { company: { findMany: vi.fn() } },
}));

import { GET } from "../route";
import { prisma } from "@/lib/prisma";
import { publishEntitlementForCompany } from "@/lib/vis-domus-publisher";

const CRON_SECRET = "test-cron-secret";
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
});

function req(auth?: string) {
  return new Request("http://x/api/cron/reconcile-entitlements", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("reconcile-entitlements cron", () => {
  it("sem Bearer → 401", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
  });

  it("Bearer errado → 401", async () => {
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("Bearer certo → publica só as medical vinculadas", async () => {
    (prisma.company.findMany as any).mockResolvedValue([
      { id: "c1" }, { id: "c2" },
    ]);
    const res = await GET(req(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    expect(publishEntitlementForCompany).toHaveBeenCalledWith("c1");
    expect(publishEntitlementForCompany).toHaveBeenCalledWith("c2");
    // conferir o filtro da query
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformProduct: "VIS_MEDICAL", domusClinicId: { not: null } },
      }),
    );
  });

  it("falha de publish não derruba o handler (best-effort)", async () => {
    (prisma.company.findMany as any).mockResolvedValue([{ id: "c1" }]);
    (publishEntitlementForCompany as any).mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `./node_modules/.bin/vitest run src/app/api/cron/reconcile-entitlements`
Expected: FAIL — `../route` não existe.

- [ ] **Step 4: Implementar o handler**

Criar `src/app/api/cron/reconcile-entitlements/route.ts`. Usar EXATAMENTE o padrão de auth/heartbeat do `plan-change-retry` visto no Step 1. Esqueleto (ajustar imports de auth ao que o molde usa):

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishEntitlementForCompany } from "@/lib/vis-domus-publisher";
import { logger } from "@/lib/logger"; // confirmar caminho no molde

export const maxDuration = 300;

const CONCURRENCY = 5;

export async function GET(request: Request) {
  // AUTH: copiar EXATAMENTE o Bearer CRON_SECRET fail-closed do plan-change-retry.
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const companies = await prisma.company.findMany({
    where: { platformProduct: "VIS_MEDICAL", domusClinicId: { not: null } },
    select: { id: true },
  });

  let published = 0;
  const ids = companies.map((c) => c.id);
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          await publishEntitlementForCompany(id); // best-effort, já engole erro
          published++;
        } catch {
          // publishEntitlementForCompany não lança; guard extra por segurança.
        }
      }),
    );
  }

  return NextResponse.json({ ok: true, reconciled: companies.length, published });
}
```

Se o molde do `plan-change-retry` usar um wrapper `withHeartbeat` ou helper de auth, usar esse em vez do inline acima — seguir o padrão do projeto, não introduzir um novo.

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `./node_modules/.bin/vitest run src/app/api/cron/reconcile-entitlements`
Expected: PASS.

- [ ] **Step 6: Registrar o cron no vercel.json**

Editar `vercel.json`, adicionar ao array `crons` (após `plan-change-retry`):
```json
    {
      "path": "/api/cron/reconcile-entitlements",
      "schedule": "0 * * * *"
    }
```

- [ ] **Step 7: Typecheck + commit**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.
```bash
git add src/app/api/cron/reconcile-entitlements vercel.json
git commit -m "feat(cadeado): cron horario de reconcile republica coorte medical ao Domus"
```

### Task 1.4: Revisão Codex da Fase 1 + verificação

- [ ] **Step 1: Codex revisa o diff da Fase 1**

Diff da Fase 1: `git diff origin/main...HEAD` (projeção + fixes + cron). Enviar ao Codex (MCP `codex`, read-only, cwd do repo) pedindo para quebrar: a mudança de projeção quebra algum consumidor de `writeAllowed`? O cron vaza cross-tenant (filtro certo)? Auth fail-closed correto? Best-effort real? Corrigir achados reais, rejeitar falso-positivo com justificativa. Máx 2 rodadas.

- [ ] **Step 2: Verificação da fase**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run src/lib/__tests__/entitlement-projection.test.ts src/lib/__tests__/vis-domus-publisher.test.ts src/app/api/cron/reconcile-entitlements`
Expected: 0 errors, todos os testes PASS.

- [ ] **Step 3: Deploy da Fase 1 (dono decide)**

Fase 1 não tem migração. Deploy = merge da branch em main + push (auto-deploy Vercel). O DONO decide quando. Não fazer merge/push sem autorização explícita do dono — push dispara deploy de prod.

---

## FASE 2 — Outbox durável por-company via trigger (migração de risco)

### Task 2.0 (GATE): Resolver a role runtime e os grants exatos ANTES de escrever a migração

**Files:** nenhum (investigação). É um GATE — não avançar sem resolver.

Contexto (P1 do Codex, maior blast radius): a função `bump_entitlement_revision` é `SECURITY INVOKER` → a role runtime (`DATABASE_URL`) executa o corpo com os próprios privilégios. Se faltar grant em `EntitlementOutbox`, TODA escrita de Company/Subscription falha no trigger. A afirmação antiga "USAGE já concedida na V3a" é FALSA — a migração `20260719140000` não concede grant algum (assume mesmo owner Neon).

- [ ] **Step 1: Descobrir a role runtime e se difere do owner**

Pedir ao DONO rodar no banco de PROD (via `!` ou painel Neon), OU usar o MCP `postgres-neon-dev` (aponta pro banco do Vis):
```sql
-- role atual do runtime
SELECT current_user, session_user;
-- owner da tabela EntitlementRevision (referência do padrão)
SELECT tableowner FROM pg_tables WHERE tablename = 'EntitlementRevision';
-- grants existentes na EntitlementRevision (o que já foi concedido)
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'EntitlementRevision';
```
Expected: se `current_user` == `tableowner` == a role do `DATABASE_URL` (padrão Neon single-owner), nenhum grant extra é estritamente necessário — mas concedemos explicitamente mesmo assim (defesa). Se divergir, anotar a role runtime EXATA para os `GRANT` da migração.

- [x] **Step 2: Registrar a decisão no plano — RESOLVIDO 2026-07-22**

**Role runtime = `neondb_owner`** (via MCP postgres-neon-dev, `SELECT current_user` no banco de PROD do Vis). **É a MESMA role que é owner de Company, Subscription e EntitlementRevision** (`pg_tables.tableowner` = `neondb_owner` nas três). Grants existentes em `EntitlementRevision`: todos para `neondb_owner`, nenhuma outra role (padrão Neon single-owner confirmado).

**Consequência:** como o runtime É o owner, ele já pode INSERT/UPDATE/DELETE/SELECT em qualquer tabela que criar (incl. `EntitlementOutbox`) + já tem `USAGE` na `entitlement_revision_seq` (criou na V3a). **Grants extras NÃO são estritamente necessários** → mas a migração os inclui como DEFESA idempotente (`GRANT ... TO "neondb_owner"`). **O maior risco da spec (toda escrita de Company/Subscription falhar por falta de grant no trigger) NÃO se materializa** — o owner sempre pode inserir na própria tabela. Isso reduz muito o risco da migração F2. `<ROLE_RUNTIME>` = `neondb_owner` no SQL das Tasks 2.2 e 3.2.

### Task 2.1: Espelhar EntitlementOutbox no schema.prisma

**Files:**
- Modify: `prisma/schema.prisma`

Contexto (P2 do Codex): sem o modelo no schema, o próximo `prisma migrate dev`/diff proporia REMOVER a tabela criada por SQL cru. Adicionar o modelo (mesmo o worker usando `$queryRaw`), consistente com como `EntitlementRevision` está no schema (`schema.prisma:247`).

- [ ] **Step 1: Adicionar o modelo e a relação em Company**

Em `prisma/schema.prisma`, após o `model EntitlementRevision` (linha ~247), adicionar:
```prisma
model EntitlementOutbox {
  companyId String  @id
  seq       BigInt
  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
}
```

E na `model Company`, após a linha `entitlementRevision  EntitlementRevision?` (linha ~227), adicionar a relação inversa:
```prisma
  entitlementOutbox       EntitlementOutbox?
```

- [ ] **Step 2: Validar o schema (SEM tocar o banco)**

Run: `./node_modules/.bin/prisma validate`
Expected: "The schema is valid". **NÃO** rodar `migrate dev`/`db push` (banco = prod).

- [ ] **Step 3: Gerar o client**

Run: `./node_modules/.bin/prisma generate`
Expected: sucesso; `prisma.entitlementOutbox` fica disponível no client (usado nos testes/typecheck; o worker usa `$queryRaw` para o delete condicional).

- [ ] **Step 4: Typecheck + commit**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.
```bash
git add prisma/schema.prisma
git commit -m "chore(cadeado): espelha EntitlementOutbox no schema.prisma (evita drift)"
```

### Task 2.2: Migração SQL — tabela + grants + função estendida

**Files:**
- Create: `prisma/migrations/20260722120000_entitlement_outbox/migration.sql`

Contexto: cria a tabela outbox, concede grants (Task 2.0), e faz `CREATE OR REPLACE FUNCTION bump_entitlement_revision` com um único `nextval` reusado para revisão E outbox. NÃO cria trigger novo — os triggers existentes já chamam a função. Migração idempotente (retry-safe).

- [ ] **Step 1: Escrever o migration.sql**

Criar o arquivo. Substituir `<ROLE_RUNTIME>` pela role da Task 2.0 (ou remover os GRANT se single-owner confirmado — manter comentário explicando):

```sql
-- Cadeado Fase 2 — Outbox durável de publish de entitlement por-company.
--
-- Estende o trigger EXISTENTE (20260719140000): a função bump_entitlement_revision
-- ja roda em todo AFTER de Subscription/Company (FOR EACH ROW, filtrada por WHEN
-- nos campos publicaveis). Aqui ela passa a gravar tambem numa linha de outbox
-- por-company (coalescente). Um worker drena e chama o publisher (recalcula fresco).
--
-- Token de versao = seq (bigint) da MESMA sequence da revisao (nao timestamp:
-- now() e constante-por-tx, colide, e trunca micro->ms entre PG e Prisma).
--
-- Aplicar SO com `prisma migrate deploy` (nunca migrate dev/db push — .env=prod).
-- PREFLIGHT: lock_timeout curto; checar tx longas em Company (o CREATE TABLE com
-- FK adquire lock em Company). Grants: ver Task 2.0 do plano.

-- Tabela outbox por-company. PK=companyId (coalescente). seq=token opaco.
CREATE TABLE IF NOT EXISTS "EntitlementOutbox" (
  "companyId" TEXT NOT NULL,
  "seq"       BIGINT NOT NULL,
  CONSTRAINT "EntitlementOutbox_pkey" PRIMARY KEY ("companyId"),
  CONSTRAINT "EntitlementOutbox_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Grants para a role runtime (SECURITY INVOKER executa o corpo com privilegios dela).
-- Se DATABASE_URL == owner (padrao Neon), sao redundantes mas inofensivos.
-- Se a role runtime difere do owner, SAO OBRIGATORIOS (senao toda escrita de
-- Company/Subscription falha no trigger). Substituir <ROLE_RUNTIME> pela role da Task 2.0.
GRANT SELECT, INSERT, UPDATE, DELETE ON "EntitlementOutbox" TO "<ROLE_RUNTIME>";
GRANT USAGE ON SEQUENCE "entitlement_revision_seq" TO "<ROLE_RUNTIME>";

-- Funcao estendida: um unico nextval alimenta revisao E outbox (alinhados).
CREATE OR REPLACE FUNCTION "bump_entitlement_revision"(target_company_id TEXT)
RETURNS void AS $$
DECLARE
  new_seq BIGINT;
BEGIN
  IF target_company_id IS NULL THEN
    RETURN;
  END IF;
  new_seq := nextval('entitlement_revision_seq');
  INSERT INTO "EntitlementRevision" ("companyId", "revision")
  VALUES (target_company_id, new_seq)
  ON CONFLICT ("companyId")
  DO UPDATE SET "revision" = new_seq;
  INSERT INTO "EntitlementOutbox" ("companyId", "seq")
  VALUES (target_company_id, new_seq)
  ON CONFLICT ("companyId")
  DO UPDATE SET "seq" = new_seq;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Conferir o SQL manualmente (não aplicar)**

Ler o arquivo. Confirmar: `CREATE TABLE IF NOT EXISTS` (idempotente), `CREATE OR REPLACE FUNCTION` (idempotente), grants idempotentes. NÃO há `CREATE TRIGGER` (correto — os triggers existentes herdam). NÃO rodar migrate — a aplicação é manual pelo dono no deploy.

- [ ] **Step 3: Commit da migração (não aplicada)**

```bash
git add prisma/migrations/20260722120000_entitlement_outbox/migration.sql
git commit -m "feat(cadeado): migracao outbox por-company + funcao estendida (NAO aplicada)"
```

### Task 2.3: Variante tryPublish que sinaliza sucesso/falha

**Files:**
- Modify: `src/lib/vis-domus-publisher.ts`
- Test: `src/lib/__tests__/vis-domus-publisher.test.ts`

Contexto (P1 do Codex): `publishEntitlementForCompany` retorna `void` e engole todo erro → o worker não distinguiria sucesso de falha e apagaria a linha do outbox mesmo em falha. A variante retorna um resultado tipado. A versão `void` permanece para os call-sites inline.

- [ ] **Step 1: Escrever os testes da variante**

Adicionar a `src/lib/__tests__/vis-domus-publisher.test.ts` (ou criar bloco novo). Testar os 3 resultados. Como o publisher usa `fetch` global e envs, mockar `global.fetch` e `process.env`. Casos:
```typescript
describe("tryPublishEntitlementForCompany — sinaliza sucesso/falha", () => {
  // setup: mock buildEntitlementPayload OU montar company medical no mock do prisma;
  // seguir o estilo já usado nos testes existentes deste arquivo para o payload.

  it("config ausente (sem secret/url) → failed", async () => {
    delete process.env.VIS_DOMUS_WEBHOOK_SECRET;
    delete process.env.DOMUS_WEBHOOK_URL;
    const r = await tryPublishEntitlementForCompany("c1");
    expect(r.kind).toBe("failed");
  });

  it("payload null (nao-medical) → noop", async () => {
    // mockar buildEntitlementPayload → null (company nao-medical/sem vinculo)
    const r = await tryPublishEntitlementForCompany("c-otica");
    expect(r.kind).toBe("noop");
  });

  it("fetch 2xx → published", async () => {
    // envs setadas + buildEntitlementPayload retorna payload + fetch resolve ok:true
    const r = await tryPublishEntitlementForCompany("c1");
    expect(r.kind).toBe("published");
  });

  it("fetch !ok (500) → failed", async () => {
    // fetch resolve { ok:false, status:500 }
    const r = await tryPublishEntitlementForCompany("c1");
    expect(r.kind).toBe("failed");
  });

  it("fetch lanca (rede) → failed", async () => {
    // fetch rejeita
    const r = await tryPublishEntitlementForCompany("c1");
    expect(r.kind).toBe("failed");
  });
});
```
Consultar os testes existentes deste arquivo para replicar o mock de `buildEntitlementPayload`/prisma exatamente como já é feito (não inventar um mock novo divergente).

- [ ] **Step 2: Rodar e ver falhar**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/vis-domus-publisher.test.ts`
Expected: FAIL — `tryPublishEntitlementForCompany` não existe.

- [ ] **Step 3: Implementar a variante**

Em `src/lib/vis-domus-publisher.ts`, adicionar (reaproveitando `buildEntitlementPayload`, `signVisDomus`, e as mesmas envs). Refatorar o corpo de `publishEntitlementForCompany` para delegar à variante:

```typescript
export type PublishResult =
  | { kind: "published" }
  | { kind: "noop" }
  | { kind: "failed"; reason: string };

/**
 * Como publishEntitlementForCompany, mas RETORNA o resultado (o worker do outbox
 * precisa distinguir sucesso de falha para decidir se apaga a linha). A versão
 * void continua existindo para os call-sites inline (que não olham o resultado).
 */
export async function tryPublishEntitlementForCompany(companyId: string): Promise<PublishResult> {
  const secret = process.env.VIS_DOMUS_WEBHOOK_SECRET;
  const url = process.env.DOMUS_WEBHOOK_URL;
  if (!secret || !url) {
    return { kind: "failed", reason: "config ausente (sem secret/url)" };
  }
  try {
    const now = new Date();
    const payload = await buildEntitlementPayload(companyId, now);
    if (!payload) return { kind: "noop" }; // nao-medical/sem vinculo — nada a publicar

    const rawBody = JSON.stringify(payload);
    const ts = now.getTime();
    const signature = signVisDomus(secret, ts, rawBody);
    const res = await fetch(`${url}/api/internal/vis/entitlements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vis-timestamp": String(ts),
        "x-vis-signature": signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { kind: "failed", reason: `http ${res.status}` };
    return { kind: "published" };
  } catch (err) {
    return { kind: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}
```

E reescrever `publishEntitlementForCompany` para delegar (mantendo o comportamento best-effort/void + os logs existentes):
```typescript
export async function publishEntitlementForCompany(companyId: string): Promise<void> {
  const r = await tryPublishEntitlementForCompany(companyId);
  if (r.kind === "failed") {
    logger.warn("publish falhou (pull de reparação cobre)", {
      window: WINDOW_LOG, companyId, reason: r.reason,
    });
  }
}
```
(Confirmar que `WINDOW_LOG`, `logger`, `signVisDomus` já estão importados no arquivo — estão. Se algum log específico de status era emitido antes, preservar a informação no `reason`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/vis-domus-publisher.test.ts`
Expected: PASS (variante + os testes antigos de `publishEntitlementForCompany` continuam válidos).

- [ ] **Step 5: Typecheck + commit**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.
```bash
git add src/lib/vis-domus-publisher.ts src/lib/__tests__/vis-domus-publisher.test.ts
git commit -m "feat(cadeado): tryPublishEntitlementForCompany sinaliza published/noop/failed"
```

### Task 2.4: Worker de drenagem do outbox

**Files:**
- Create: `src/lib/entitlement-outbox-worker.ts`
- Create: `src/app/api/cron/drain-entitlement-outbox/route.ts`
- Modify: `vercel.json`
- Test: `src/lib/__tests__/entitlement-outbox-worker.test.ts`

Contexto: worker lê o outbox ordenado por `seq`, publica via `tryPublish…`, e faz delete condicional por `seq` (só em `published`|`noop`). Um só worker (cron horário) — sem `FOR UPDATE SKIP LOCKED`. Handler fino delega para `src/lib/` (padrão do `plan-change-retry`).

- [ ] **Step 1: Escrever os testes do worker (lógica em src/lib)**

Criar `src/lib/__tests__/entitlement-outbox-worker.test.ts`. Mockar `@/lib/prisma` (`$queryRaw` para o read do batch, `$executeRaw` para o delete) e `@/lib/vis-domus-publisher` (`tryPublishEntitlementForCompany`). Casos:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/vis-domus-publisher", () => ({
  tryPublishEntitlementForCompany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn() },
}));

import { runOutboxDrainBatch } from "@/lib/entitlement-outbox-worker";
import { prisma } from "@/lib/prisma";
import { tryPublishEntitlementForCompany } from "@/lib/vis-domus-publisher";

beforeEach(() => vi.clearAllMocks());

describe("runOutboxDrainBatch", () => {
  it("published → deleta a linha por (companyId, seq)", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ companyId: "c1", seq: 10n }]);
    (tryPublishEntitlementForCompany as any).mockResolvedValue({ kind: "published" });
    (prisma.$executeRaw as any).mockResolvedValue(1);
    const r = await runOutboxDrainBatch();
    expect(tryPublishEntitlementForCompany).toHaveBeenCalledWith("c1");
    expect(prisma.$executeRaw).toHaveBeenCalledOnce(); // delete condicional
    expect(r.drained).toBe(1);
  });

  it("noop → tambem deleta (company deixou de ser medical)", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ companyId: "c1", seq: 10n }]);
    (tryPublishEntitlementForCompany as any).mockResolvedValue({ kind: "noop" });
    (prisma.$executeRaw as any).mockResolvedValue(1);
    const r = await runOutboxDrainBatch();
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(r.drained).toBe(1);
  });

  it("failed → NAO deleta, reprocessa no proximo tick", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ companyId: "c1", seq: 10n }]);
    (tryPublishEntitlementForCompany as any).mockResolvedValue({ kind: "failed", reason: "http 500" });
    const r = await runOutboxDrainBatch();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
  });

  it("re-enqueue durante publish (seq avancou) → delete condicional nao casa, linha fica", async () => {
    // o delete usa WHERE companyId=? AND seq=?; se o trigger reescreveu seq,
    // o executeRaw retorna 0 linhas afetadas → nao perdeu o estado novo.
    (prisma.$queryRaw as any).mockResolvedValue([{ companyId: "c1", seq: 10n }]);
    (tryPublishEntitlementForCompany as any).mockResolvedValue({ kind: "published" });
    (prisma.$executeRaw as any).mockResolvedValue(0); // 0 linhas: seq mudou
    const r = await runOutboxDrainBatch();
    expect(r.drained).toBe(1); // publicou o estado que leu; o novo seq drena no proximo tick
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/entitlement-outbox-worker.test.ts`
Expected: FAIL — `@/lib/entitlement-outbox-worker` não existe.

- [ ] **Step 3: Implementar a lógica do worker**

Criar `src/lib/entitlement-outbox-worker.ts`. Usar `Prisma.sql` como o `retry-worker.ts` faz:
```typescript
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tryPublishEntitlementForCompany } from "@/lib/vis-domus-publisher";

const BATCH_SIZE = 50;
const CONCURRENCY = 5;

export interface OutboxDrainResult {
  read: number;
  drained: number; // published + noop (linhas removidas)
  failed: number;
}

/**
 * Drena o EntitlementOutbox: le um batch ordenado por seq, publica cada company
 * (recalcula estado fresco), e apaga a linha SO em published|noop, com delete
 * condicional por (companyId, seq) — se o trigger re-enfileirou (seq maior)
 * durante o publish, o delete nao casa e a linha fica pro proximo tick.
 * Um so worker (cron horario) — sem FOR UPDATE SKIP LOCKED.
 */
export async function runOutboxDrainBatch(): Promise<OutboxDrainResult> {
  const rows = await prisma.$queryRaw<Array<{ companyId: string; seq: bigint }>>(Prisma.sql`
    SELECT "companyId", "seq" FROM "EntitlementOutbox"
    ORDER BY "seq" ASC
    LIMIT ${BATCH_SIZE}
  `);

  let drained = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ companyId, seq }) => {
        const r = await tryPublishEntitlementForCompany(companyId);
        if (r.kind === "failed") {
          failed++;
          return; // NAO deleta — reprocessa
        }
        // published | noop → delete condicional por seq
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM "EntitlementOutbox"
          WHERE "companyId" = ${companyId} AND "seq" = ${seq}
        `);
        drained++;
      }),
    );
  }

  return { read: rows.length, drained, failed };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/entitlement-outbox-worker.test.ts`
Expected: PASS.

- [ ] **Step 5: Criar o handler do cron (fino, delega)**

Criar `src/app/api/cron/drain-entitlement-outbox/route.ts`, espelhando EXATAMENTE o `plan-change-retry/route.ts` (auth Bearer fail-closed + `withHeartbeat` + `logger.child` + `maxDuration 300`):
```typescript
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";
import { runOutboxDrainBatch } from "@/lib/entitlement-outbox-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = logger.child({ cron: "drain-entitlement-outbox" });

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) log.error("CRON_SECRET não configurado — drain recusado (fail-closed)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return await withHeartbeat("drain-entitlement-outbox", async () => {
      const batch = await runOutboxDrainBatch();
      log.info("batch de drain processado", { ...batch });
      return NextResponse.json({ ok: true, ...batch });
    });
  } catch (err) {
    log.error("falha geral no worker de drain do outbox", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Registrar o cron no vercel.json**

Editar `vercel.json`, adicionar ao array `crons`:
```json
    {
      "path": "/api/cron/drain-entitlement-outbox",
      "schedule": "0 * * * *"
    }
```

- [ ] **Step 7: Typecheck + testes + commit**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run src/lib/__tests__/entitlement-outbox-worker.test.ts`
Expected: 0 errors, PASS.
```bash
git add src/lib/entitlement-outbox-worker.ts src/app/api/cron/drain-entitlement-outbox vercel.json
git commit -m "feat(cadeado): worker de drenagem do outbox (delete condicional por seq)"
```

### Task 2.5: Revisão Codex da Fase 2 + plano de deploy

- [ ] **Step 1: Codex quebra o diff da Fase 2**

Diff: schema.prisma + migration.sql + tryPublish + worker + handler + vercel.json. Enviar ao Codex (read-only) pedindo para atacar: a função estendida pode deadlockar ou amplificar contenção? O delete condicional por `seq` perde alguma transição? O `noop` deletar está correto (company que virou VIS_APP some do outbox sem revogar — isso é a Fase 3, ok aqui)? Grants suficientes? `$queryRaw`/`$executeRaw` com injeção segura (Prisma.sql parametrizado — sim)? Máx 2 rodadas; corrigir real, rejeitar falso-positivo.

- [ ] **Step 2: Documentar o deploy manual da Fase 2**

Escrever o runbook de deploy (para o dono executar): (a) preflight — checar tx longas em Company (`SELECT * FROM pg_stat_activity WHERE state != 'idle' AND query ILIKE '%Company%'`); (b) aplicar migração `./node_modules/.bin/prisma migrate deploy` com `!` (dono); (c) write de teste controlado — `UPDATE "Company" SET "updatedAt" = "updatedAt" WHERE id = '<uma medical vinculada>'` e conferir `SELECT * FROM "EntitlementOutbox" WHERE "companyId" = '<essa>'` retornou linha (prova que o enqueue funciona com a role real); (d) merge+push do código DEPOIS da migração. Ordem crítica: migração ANTES do código.

- [ ] **Step 3: Verificação da fase**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run src/lib/__tests__/vis-domus-publisher.test.ts src/lib/__tests__/entitlement-outbox-worker.test.ts`
Expected: 0 errors, PASS.

---

## FASE 3 — Revogação do vínculo órfão (cross-repo, receiver-first)

### Task 3.0 (GATE cross-repo): O Domus tem de aceitar revogação por-clinicId PRIMEIRO

**Files:** nenhum neste repo. É um GATE — a Fase 3 do Vis (emitir revogação) NÃO liga até o Domus aceitar.

Contexto (P0-B): o outbox por-company (§4) não revoga o entitlement órfão quando `domusClinicId A→B`, `A→NULL`, `platformProduct→VIS_APP`, ou a Company é deletada. A revogação precisa publicar `writeAllowed:false` para um `clinicId` SEM company viva — formato que o receptor atual do Domus não aceita. Receiver-first (igual ao D1).

- [ ] **Step 1: Especificar o contrato de revogação (payload)**

Definir aqui o payload de revogação que o Vis emitirá e o Domus receberá:
```
{ domusClinicId: string, entitlement: { writeAllowed: false, reason: "UNLINKED" }, sourceRevision: string, generatedAt: ISO }
```
Sem `visCompanyId`, sem `plan` (não há company). O Domus grava `writeAllowed:false` para aquele clinicId, respeitando `sourceRevision` monotônico.

- [ ] **Step 2: Sub-plano do lado Domus (outro repo)**

O trabalho no Domus (`~/SISTEMACLINICADOMUS`) é uma sub-fase própria: rota/branch que aceita o payload de revogação, valida HMAC (mesmo segredo do canal de entitlement), grava `writeAllowed:false` por clinicId ordenando por `sourceRevision`. Planejar e quebrar com o Codex DO LADO DOMUS (não misturar árvores). Só depois de esse contrato estar EM PROD no Domus, prosseguir para a Task 3.1 do Vis.

- [ ] **Step 3: Registrar o estado do gate**

Anotar aqui se o Domus já aceita revogação. Se NÃO: parar a Fase 3 do Vis; o buraco fica coberto por runbook manual (admin revoga no Domus na mão nas raras desvinculações). Hoje ~2 companies, vínculo estável → risco teórico. Se SIM: prosseguir.

### Task 3.1: Publisher de revogação por-clinicId

**Files:**
- Modify: `src/lib/vis-domus-publisher.ts`
- Test: `src/lib/__tests__/vis-domus-publisher.test.ts`

Contexto: função que publica um payload de revogação para um `domusClinicId` órfão. Não parte de company (a company pode nem existir mais). Reusa HMAC/envs.

- [ ] **Step 1: Escrever o teste**

Adicionar ao arquivo de teste do publisher:
```typescript
describe("tryRevokeEntitlementForClinic — revoga clinicId orfao", () => {
  it("config ausente → failed", async () => {
    delete process.env.VIS_DOMUS_WEBHOOK_SECRET;
    delete process.env.DOMUS_WEBHOOK_URL;
    const r = await tryRevokeEntitlementForClinic("clinic-a", "42");
    expect(r.kind).toBe("failed");
  });
  it("fetch 2xx → published (writeAllowed:false, reason UNLINKED)", async () => {
    // envs setadas; capturar o body enviado e assertar writeAllowed:false + reason UNLINKED + domusClinicId
    const r = await tryRevokeEntitlementForClinic("clinic-a", "42");
    expect(r.kind).toBe("published");
  });
  it("fetch !ok → failed", async () => {
    const r = await tryRevokeEntitlementForClinic("clinic-a", "42");
    expect(r.kind).toBe("failed");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/vis-domus-publisher.test.ts`
Expected: FAIL — `tryRevokeEntitlementForClinic` não existe.

- [ ] **Step 3: Implementar**

Em `src/lib/vis-domus-publisher.ts`:
```typescript
/**
 * Revoga o entitlement de um clinicId que perdeu o vinculo com sua company
 * (desvinculo/reassociacao/delete). Publica writeAllowed:false SEM company viva.
 * Contrato cross-repo: o Domus precisa aceitar este payload (Fase 3, receiver-first).
 * seq = token da mesma sequence (ordena no Domus por sourceRevision).
 */
export async function tryRevokeEntitlementForClinic(
  domusClinicId: string,
  seq: string,
): Promise<PublishResult> {
  const secret = process.env.VIS_DOMUS_WEBHOOK_SECRET;
  const url = process.env.DOMUS_WEBHOOK_URL;
  if (!secret || !url) return { kind: "failed", reason: "config ausente (sem secret/url)" };
  try {
    const now = new Date();
    const payload = {
      domusClinicId,
      entitlement: { writeAllowed: false, reason: "UNLINKED" },
      sourceRevision: seq,
      generatedAt: now.toISOString(),
    };
    const rawBody = JSON.stringify(payload);
    const ts = now.getTime();
    const signature = signVisDomus(secret, ts, rawBody);
    const res = await fetch(`${url}/api/internal/vis/entitlements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vis-timestamp": String(ts),
        "x-vis-signature": signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { kind: "failed", reason: `http ${res.status}` };
    return { kind: "published" };
  } catch (err) {
    return { kind: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}
```
(Confirmar com o contrato Domus da Task 3.0 se a rota/campo batem — ajustar `reason`/rota conforme o que o Domus implementou. Se o Domus expõe uma rota dedicada de revogação, usar essa em vez de `/api/internal/vis/entitlements`.)

- [ ] **Step 4: Rodar e ver passar + typecheck + commit**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/vis-domus-publisher.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, 0 errors.
```bash
git add src/lib/vis-domus-publisher.ts src/lib/__tests__/vis-domus-publisher.test.ts
git commit -m "feat(cadeado): tryRevokeEntitlementForClinic revoga clinicId orfao (cross-repo)"
```

### Task 3.2: Migração — outbox de revogação + trigger de captura + trigger DELETE em Company

**Files:**
- Create: `prisma/migrations/20260722130000_entitlement_revocation/migration.sql`
- Modify: `prisma/schema.prisma`

Contexto: tabela de revogação chaveada por `domusClinicId` (NÃO cascateia no delete da Company — sobrevive a ela). Trigger de UPDATE de Company enfileira `OLD.domusClinicId` quando o vínculo some/muda. Trigger NOVO `AFTER DELETE ON Company` enfileira o clinicId da company deletada.

- [ ] **Step 1: Espelhar no schema.prisma**

Adicionar em `prisma/schema.prisma`:
```prisma
model EntitlementRevocationOutbox {
  domusClinicId String @id
  seq           BigInt
}
```
(SEM relação com Company — é chaveada por clinicId de propósito, para sobreviver ao delete da company.)

Run: `./node_modules/.bin/prisma validate && ./node_modules/.bin/prisma generate`
Expected: válido; client gerado.

- [ ] **Step 2: Escrever o migration.sql**

Criar `prisma/migrations/20260722130000_entitlement_revocation/migration.sql`:
```sql
-- Cadeado Fase 3 — Revogacao de entitlement orfao (P0-B).
-- Quando o vinculo clinica<->company some/muda, o clinicId antigo tem de ser
-- revogado no Domus (writeAllowed:false). O outbox por-company nao faz isso (so
-- republica o estado da company atual). Tabela chaveada por domusClinicId, SEM FK
-- pra Company (sobrevive ao delete da company).

CREATE TABLE IF NOT EXISTS "EntitlementRevocationOutbox" (
  "domusClinicId" TEXT NOT NULL,
  "seq"           BIGINT NOT NULL,
  CONSTRAINT "EntitlementRevocationOutbox_pkey" PRIMARY KEY ("domusClinicId")
);

GRANT SELECT, INSERT, UPDATE, DELETE ON "EntitlementRevocationOutbox" TO "<ROLE_RUNTIME>";

-- enqueue de revogacao (coalescente por clinicId).
CREATE OR REPLACE FUNCTION "enqueue_entitlement_revocation"(target_clinic_id TEXT)
RETURNS void AS $$
BEGIN
  IF target_clinic_id IS NULL THEN RETURN; END IF;
  INSERT INTO "EntitlementRevocationOutbox" ("domusClinicId", "seq")
  VALUES (target_clinic_id, nextval('entitlement_revision_seq'))
  ON CONFLICT ("domusClinicId")
  DO UPDATE SET "seq" = nextval('entitlement_revision_seq');
END;
$$ LANGUAGE plpgsql;

-- UPDATE de Company: se domusClinicId mudou (A->B, A->NULL) e OLD nao-nulo, OU
-- deixou de ser VIS_MEDICAL com clinicId, enfileira revogacao do clinicId ANTIGO.
CREATE OR REPLACE FUNCTION "trg_company_revocation"()
RETURNS trigger AS $$
BEGIN
  IF (OLD."domusClinicId" IS NOT NULL) AND (
       NEW."domusClinicId" IS DISTINCT FROM OLD."domusClinicId"
       OR (OLD."platformProduct" = 'VIS_MEDICAL' AND NEW."platformProduct" IS DISTINCT FROM 'VIS_MEDICAL')
     ) THEN
    PERFORM "enqueue_entitlement_revocation"(OLD."domusClinicId");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "company_revocation_upd" ON "Company";
CREATE TRIGGER "company_revocation_upd"
  AFTER UPDATE ON "Company"
  FOR EACH ROW
  WHEN (
    NEW."domusClinicId"   IS DISTINCT FROM OLD."domusClinicId" OR
    NEW."platformProduct" IS DISTINCT FROM OLD."platformProduct"
  )
  EXECUTE FUNCTION "trg_company_revocation"();

-- DELETE de Company: enfileira revogacao se era medical vinculada.
CREATE OR REPLACE FUNCTION "trg_company_revocation_del"()
RETURNS trigger AS $$
BEGIN
  IF OLD."platformProduct" = 'VIS_MEDICAL' AND OLD."domusClinicId" IS NOT NULL THEN
    PERFORM "enqueue_entitlement_revocation"(OLD."domusClinicId");
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "company_revocation_del" ON "Company";
CREATE TRIGGER "company_revocation_del"
  AFTER DELETE ON "Company"
  FOR EACH ROW EXECUTE FUNCTION "trg_company_revocation_del"();
```

- [ ] **Step 3: Conferir o SQL (não aplicar) + commit**

Ler o arquivo. Confirmar idempotência (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`). NÃO aplicar (deploy manual do dono).
```bash
git add prisma/schema.prisma prisma/migrations/20260722130000_entitlement_revocation/migration.sql
git commit -m "feat(cadeado): migracao outbox de revogacao + triggers Company update/delete (NAO aplicada)"
```

### Task 3.3: Worker de drenagem da revogação

**Files:**
- Modify: `src/lib/entitlement-outbox-worker.ts` (adicionar a drenagem de revogação)
- Modify: `src/app/api/cron/drain-entitlement-outbox/route.ts` (drena os dois no mesmo tick)
- Test: `src/lib/__tests__/entitlement-outbox-worker.test.ts`

Contexto: o mesmo cron drena os dois outboxes (decisão de planejamento: um handler só, para não duplicar auth/heartbeat). Delete condicional por `seq`, igual.

- [ ] **Step 1: Escrever o teste da drenagem de revogação**

Adicionar ao mock de `@/lib/vis-domus-publisher` no topo do arquivo o método `tryRevokeEntitlementForClinic: vi.fn()`, importá-lo, e adicionar o bloco:
```typescript
import { runRevocationDrainBatch } from "@/lib/entitlement-outbox-worker";
import { tryRevokeEntitlementForClinic } from "@/lib/vis-domus-publisher";

describe("runRevocationDrainBatch", () => {
  it("published → deleta por (domusClinicId, seq)", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ domusClinicId: "clinic-a", seq: 20n }]);
    (tryRevokeEntitlementForClinic as any).mockResolvedValue({ kind: "published" });
    (prisma.$executeRaw as any).mockResolvedValue(1);
    const r = await runRevocationDrainBatch();
    expect(tryRevokeEntitlementForClinic).toHaveBeenCalledWith("clinic-a", "20");
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(r.revoked).toBe(1);
  });

  it("failed → NAO deleta", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ domusClinicId: "clinic-a", seq: 20n }]);
    (tryRevokeEntitlementForClinic as any).mockResolvedValue({ kind: "failed", reason: "http 500" });
    const r = await runRevocationDrainBatch();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
  });

  it("re-enqueue (seq mudou) → delete condicional nao casa, linha fica", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ domusClinicId: "clinic-a", seq: 20n }]);
    (tryRevokeEntitlementForClinic as any).mockResolvedValue({ kind: "published" });
    (prisma.$executeRaw as any).mockResolvedValue(0); // 0 linhas: seq avancou
    const r = await runRevocationDrainBatch();
    expect(r.revoked).toBe(1); // revogou o que leu; novo seq drena no proximo tick
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `runRevocationDrainBatch` não existe.

- [ ] **Step 3: Implementar `runRevocationDrainBatch`**

Em `src/lib/entitlement-outbox-worker.ts`, adicionar (import de `tryRevokeEntitlementForClinic`):
```typescript
import { tryRevokeEntitlementForClinic } from "@/lib/vis-domus-publisher";

export interface RevocationDrainResult {
  read: number;
  revoked: number;
  failed: number;
}

/**
 * Drena o EntitlementRevocationOutbox: revoga cada clinicId orfao no Domus.
 * Delete condicional por (domusClinicId, seq) — igual ao drain de publish.
 * Nao ha "noop" (revogacao sempre tem clinicId); so published deleta.
 */
export async function runRevocationDrainBatch(): Promise<RevocationDrainResult> {
  const rows = await prisma.$queryRaw<Array<{ domusClinicId: string; seq: bigint }>>(Prisma.sql`
    SELECT "domusClinicId", "seq" FROM "EntitlementRevocationOutbox"
    ORDER BY "seq" ASC
    LIMIT ${BATCH_SIZE}
  `);

  let revoked = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ domusClinicId, seq }) => {
        const r = await tryRevokeEntitlementForClinic(domusClinicId, seq.toString());
        if (r.kind !== "published") {
          failed++;
          return; // NAO deleta — reprocessa
        }
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM "EntitlementRevocationOutbox"
          WHERE "domusClinicId" = ${domusClinicId} AND "seq" = ${seq}
        `);
        revoked++;
      }),
    );
  }

  return { read: rows.length, revoked, failed };
}
```

- [ ] **Step 4: O handler drena os dois**

Em `src/app/api/cron/drain-entitlement-outbox/route.ts`, dentro do `withHeartbeat`, chamar os dois e agregar:
```typescript
const pub = await runOutboxDrainBatch();
const rev = await runRevocationDrainBatch();
return NextResponse.json({ ok: true, publish: pub, revocation: rev });
```

- [ ] **Step 5: Rodar testes + typecheck + commit**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/entitlement-outbox-worker.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, 0 errors.
```bash
git add src/lib/entitlement-outbox-worker.ts src/app/api/cron/drain-entitlement-outbox/route.ts src/lib/__tests__/entitlement-outbox-worker.test.ts
git commit -m "feat(cadeado): worker drena outbox de revogacao (clinicId orfao)"
```

### Task 3.4: Revisão Codex da Fase 3 + deploy

- [ ] **Step 1: Codex quebra o diff da Fase 3**

Atacar: o trigger de revogação captura o clinicId ANTIGO corretamente em todos os ramos (A→B, A→NULL, VIS_MEDICAL→VIS_APP, delete)? Há corrida entre o publish da company nova (B) e a revogação da antiga (A) — ordenam certo por seq? O trigger DELETE em Company interage com o CASCADE do outbox de publish (companyId) sem apagar a revogação (clinicId)? Máx 2 rodadas.

- [ ] **Step 2: Runbook de deploy Fase 3**

Documentar: contrato Domus EM PROD primeiro (Task 3.0); depois migração `20260722130000` com `!` (dono) + preflight; write de teste (mudar domusClinicId de uma company de teste e conferir a linha na `EntitlementRevocationOutbox`); merge+push.

---

## Task Final: Verificação completa (OBRIGATÓRIA)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Suite de testes completa**

Run: `./node_modules/.bin/vitest run`
Expected: todos PASS (as falhas de integração/DB ambiental pré-existentes, se houver, não contam — confirmar que nenhuma NOVA falha foi introduzida).

- [ ] **Step 3: Build de produção**

Run: `./node_modules/.bin/next build`
Expected: success. (Se colidir com lock do `.next`, `rm -rf .next` e repetir — gotcha conhecido.)

- [ ] **Step 4: Commit de resíduos + resumo**

```bash
git status --short
git add -A && git commit -m "chore(cadeado): verificacao final das 3 fases" || echo "nada a commitar"
```
Resumir: o que foi implementado por fase, o que o Codex apontou/foi corrigido, o que rodou verde, o que depende de deploy manual do dono (migrações + push) e do contrato Domus (Fase 3). Enforce continua OFF.
