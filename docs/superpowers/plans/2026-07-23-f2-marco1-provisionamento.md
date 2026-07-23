# F2 Marco 1 — Provisionamento de clínica (admin → Domus) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o super admin cria um cliente VIS_MEDICAL no Vis, a clínica é provisionada automaticamente no Domus (sem script manual), com o convite do admin gravado (e-mail suprimido por flag até o Marco 2).

**Architecture:** Escrita distribuída entre dois bancos sem transação compartilhada, resolvida por outbox durável no Vis + fast-path síncrono + endpoint idempotente no Domus. O Vis aloca o `clinicId` (uuid) e é a fonte de verdade do estado (`provisioningState`). O Domus executa uma tx Drizzle atômica das 5 tabelas + evento de dedupe. Baseado na spec `docs/superpowers/specs/2026-07-23-f2-provisionamento-medical-design.md` (§4 Marco 1, §5 REQ-1..7, §6 dados, §6.1 contrato wire).

**Tech Stack:** Vis = Next.js 16 + Prisma + Postgres. Domus = Next.js 16 + Drizzle + Postgres Neon + better-auth. HMAC sha256. Vitest nos dois.

**Environment notes:**
- **Duas árvores de trabalho (worktrees irmãos):** Vis = `/Users/matheusreboucas/PDV-OTICA-f2-marco1` (branch `f2-marco1-provisionamento`); Domus = `/Users/matheusreboucas/SISTEMACLINICADOMUS-f2-marco1` (branch `f2-marco1-provision-endpoint`). Parte A roda no worktree do Domus; Parte B, no do Vis.
- **PHI:** o banco PROD do Domus (`ep-odd-credit-...neon.tech`) tem 116 pacientes reais e NUNCA deve ser tocado no desenvolvimento. Todo teste de integração do Domus roda contra o banco ISOLADO `ep-dawn-haze-...` via `.env.test` (`NODE_ENV=test`). A clínica existente "Domus Saude" (clinicId `7110db1b-528b-4451-a2c4-3581f370b9df`) NÃO é tocada (F2 vale só para clínicas novas).
- **Migrações são MANUAIS (dono, com `!`).** As tasks de migração deste plano ENTREGAM o `.sql` hand-written pronto, mas o passo de aplicar é do dono: Domus primeiro no isolado `ep-dawn-haze`, depois prod; Vis em prod. O implementador NUNCA roda `prisma migrate deploy`, `prisma db push` nem `drizzle-kit push/migrate` — só gera o SQL e pede ao dono. (Regra do incidente do banco zerado.)
- **rtk** reescreve `npx` → usar `./node_modules/.bin/` direto.
- **Secret novo:** `VIS_DOMUS_PROVISION_SECRET` (separado do `VIS_DOMUS_WEBHOOK_SECRET` de entitlement) — dono adiciona nos dois projetos Vercel antes do deploy; nunca commitar valor.

---

## File Structure

### Parte A — Domus (`/Users/matheusreboucas/SISTEMACLINICADOMUS-f2-marco1`)
- Create: `drizzle/NNNN_f2_provision.sql` — migração: `clinic_invites` + `unique(lower(email))` em users + unique credential por user.
- Create: `src/lib/vis-provision-sync.ts` — núcleo do provisionamento (tx atômica das 5 tabelas + evento + idempotência + colisão de email). Espelha `vis-entitlement-sync.ts`.
- Create: `src/lib/vis-provision-hmac.ts` — verificação HMAC do canal de provision (assinatura cobre versão/método/path/nonce/ts/body; secret `VIS_DOMUS_PROVISION_SECRET`). Ou estender `vis-domus-hmac.ts` com uma variante — decidir na Task A2.
- Create: `src/app/api/internal/vis/provision/route.ts` — endpoint POST (verifica HMAC + guard-rail de host + delega em vis-provision-sync).
- Create: `tests/vis-provision/provision.test.ts` — suíte de integração (banco isolado), espelha `tests/vis-entitlements`.
- Modify: `src/db/schema.ts` — adicionar `clinicInvitesTable` + refletir os unique constraints.

### Parte B — Vis (`/Users/matheusreboucas/PDV-OTICA-f2-marco1`)
- Create: `prisma/migrations/NNNN_f2_provisioning/migration.sql` — `Company.provisioningState` enum + `provisioningAttemptId` + tabela `ProvisioningOutbox` + `ProvisioningOutbox.failureReason`.
- Create: `src/services/create-tenant-company.service.ts` — motor comum de criação (extraído da lógica hoje duplicada). Parametrizado por `ProvisionProductDecision`.
- Create: `src/lib/vis-provision-client.ts` — cliente que assina e POSTa ao `/provision` do Domus (fast-path, timeout 5s).
- Create: `src/services/provisioning-outbox.service.ts` — enfileirar + worker (backoff, maxAttempts=10, dead-letter → PROVISION_FAILED).
- Create: `src/lib/clinic-invite.ts` — gerar token de convite (hash, TTL 72h, amarrado a clinicId/email/role/nonce).
- Modify: `src/app/api/admin/clientes/create/route.ts` — usar o motor comum; para medical, alocar clinicId + enfileirar provisionamento.
- Modify: `prisma/schema.prisma` — enum + tabela + campos.
- Test: `src/services/__tests__/create-tenant-company.test.ts`, `src/services/__tests__/provisioning-outbox.test.ts`, `src/lib/__tests__/clinic-invite.test.ts`.

**Nota de ordem:** Parte A (Domus) primeiro e testada isolada; depois Parte B (Vis) chama o endpoint já pronto. O contrato §6.1 da spec é a fronteira entre as duas.

---

## PARTE A — DOMUS (endpoint `/provision`)

> Todas as tasks da Parte A rodam em `/Users/matheusreboucas/SISTEMACLINICADOMUS-f2-marco1`.

### Task A0: Confirmar o banco de teste isolado (PRÉ-REQUISITO — sem isso nada roda)

**Files:** nenhum (verificação de ambiente).

- [ ] **Step 1: Confirmar que `.env.test` existe no worktree e aponta para o banco ISOLADO**

Run: `grep -oiE 'ep-[a-z0-9-]+' .env.test 2>&1`
Expected: `ep-dawn-haze-aivk62zt` (o banco isolado). Se o arquivo NÃO existir (ele é gitignored, não vem no worktree por padrão), copie do repo principal: `cp /Users/matheusreboucas/SISTEMACLINICADOMUS/.env.test .env.test`. **Se o host for `ep-odd-credit` (PROD), PARE — é o banco com 116 pacientes reais; nunca rode testes contra ele.**

- [ ] **Step 2: Confirmar que a suíte de integração existente roda contra o isolado**

Run: `NODE_ENV=test ./node_modules/.bin/vitest run tests/vis-entitlements`
Expected: 44 testes passam (baseline). Isso prova que `NODE_ENV=test` carrega `.env.test` e conecta no isolado. Se pedir `TEST_DATABASE_URL` ausente, resolva ANTES de qualquer outra task.

### Task A1: Migração do Domus (SQL entregue; dono aplica)

**Files:**
- Create: `drizzle/0044_f2_provision.sql` (o último atual é `0043_plan_change_outbox.sql`; CONFIRME com `ls drizzle/*.sql | tail -1` e use o próximo número — não assuma 0044 cego)
- Modify: `src/db/schema.ts` (adicionar `clinicInvitesTable`)

- [ ] **Step 1: Conferir o próximo número de migração**

Run: `ls drizzle/*.sql 2>/dev/null | tail -3`
Expected: lista os .sql existentes; o novo usa o próximo índice sequencial.

- [ ] **Step 2: Escrever o SQL da migração**

Create `drizzle/NNNN_f2_provision.sql` (idempotente, `IF NOT EXISTS`):

```sql
-- F2 Marco 1: provisionamento de clínica
-- Convite de admin (token amarrado à clínica; senha nunca transita)
CREATE TABLE IF NOT EXISTS clinic_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email         text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL DEFAULT 'admin',
  token_hash    text NOT NULL,
  nonce         text NOT NULL,
  purpose       text NOT NULL DEFAULT 'clinic_admin_onboarding',
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_invites_token_hash_key ON clinic_invites(token_hash);
CREATE INDEX IF NOT EXISTS clinic_invites_clinic_id_idx ON clinic_invites(clinic_id);

-- REQ-2 / REQ-7: email único global case-insensitive (mata colisão cross-tenant).
-- CONCURRENTLY não roda em migração transacional; a tabela é pequena (poucos users) → índice normal.
CREATE UNIQUE INDEX IF NOT EXISTS users_lower_email_key ON users (lower(email));

-- REQ-7: uma credencial (provider 'credential') por usuário — evita account duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_credential_key
  ON accounts (user_id) WHERE provider_id = 'credential';
```

> NOTA para o implementador: confirme os nomes REAIS de coluna/tabela no `src/db/schema.ts` antes de finalizar o SQL (`users.email`, `accounts.user_id`, `accounts.provider_id`, `clinics.id`). Ajuste o SQL se os nomes físicos diferirem (Drizzle pode mapear camelCase→snake_case). NÃO invente nomes.

- [ ] **Step 3: Adicionar `clinicInvitesTable` ao schema Drizzle**

Em `src/db/schema.ts`, espelhando o padrão das tabelas existentes (ver `clinicEntitlementsTable`):

```typescript
export const clinicInvitesTable = pgTable("clinic_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"),
  tokenHash: text("token_hash").notNull(),
  nonce: text("nonce").notNull(),
  purpose: text("purpose").notNull().default("clinic_admin_onboarding"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

> Confirme os imports (`pgTable, uuid, text, timestamp`) já presentes no topo do arquivo.

- [ ] **Step 4: Pedir ao dono para aplicar a migração no banco ISOLADO**

**AÇÃO DO DONO (não do implementador).** Peça:
> "Aplique `drizzle/NNNN_f2_provision.sql` no banco de teste do Domus (`ep-dawn-haze`) com `!`, ex.: `! psql "$TEST_DATABASE_URL" -f drizzle/NNNN_f2_provision.sql`. Só nesse banco por enquanto — prod fica para o fim do Marco 1."

Expected: dono confirma aplicação no isolado. NÃO prosseguir para os testes de integração sem essa confirmação.

- [ ] **Step 5: Commit**

```bash
cd /Users/matheusreboucas/SISTEMACLINICADOMUS-f2-marco1
git add drizzle/NNNN_f2_provision.sql src/db/schema.ts
git commit -m "feat(f2): migração provision — clinic_invites + unique lower(email) + unique credential"
```

### Task A2: HMAC do canal de provision

**Files:**
- Create: `src/lib/vis-provision-hmac.ts`
- Test: `src/lib/__tests__/vis-provision-hmac.test.ts`

- [ ] **Step 1: Ler o HMAC de entitlement existente para espelhar o padrão**

Run: `sed -n '1,60p' src/lib/vis-domus-hmac.ts`
Expected: ver `verifyVisDomus` (assina `${ts}.${body}`, janela 5min, timingSafeEqual, fail-closed). O de provision estende a mensagem assinada.

- [ ] **Step 2: Escrever o teste que falha**

Create `src/lib/__tests__/vis-provision-hmac.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { signVisProvision, verifyVisProvision } from "../vis-provision-hmac";

const SECRET = "test-provision-secret";
const method = "POST";
const path = "/api/internal/vis/provision";

describe("vis-provision-hmac", () => {
  it("assina e verifica um payload válido dentro da janela", () => {
    const ts = 1_700_000_000_000;
    const nonce = "nonce-1";
    const body = JSON.stringify({ version: 1, clinicId: "c1" });
    const sig = signVisProvision(SECRET, { version: 1, method, path, nonce, ts, body });
    expect(verifyVisProvision(SECRET, { version: 1, method, path, nonce, ts, body, signature: sig, now: ts + 1000 })).toBe(true);
  });

  it("rejeita assinatura fora da janela de 5min", () => {
    const ts = 1_700_000_000_000;
    const nonce = "n"; const body = "{}";
    const sig = signVisProvision(SECRET, { version: 1, method, path, nonce, ts, body });
    expect(verifyVisProvision(SECRET, { version: 1, method, path, nonce, ts, body, signature: sig, now: ts + 6 * 60_000 })).toBe(false);
  });

  it("rejeita se o path da assinatura difere (previne replay cross-endpoint)", () => {
    const ts = 1_700_000_000_000; const nonce = "n"; const body = "{}";
    const sig = signVisProvision(SECRET, { version: 1, method, path, nonce, ts, body });
    expect(verifyVisProvision(SECRET, { version: 1, method, path: "/other", nonce, ts, body, signature: sig, now: ts + 1000 })).toBe(false);
  });

  it("fail-closed: secret vazio → false", () => {
    expect(verifyVisProvision("", { version: 1, method, path, nonce: "n", ts: Date.now(), body: "{}", signature: "x", now: Date.now() })).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar o teste — deve falhar**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/vis-provision-hmac.test.ts`
Expected: FAIL (módulo `../vis-provision-hmac` não existe).

- [ ] **Step 4: Implementar**

Create `src/lib/vis-provision-hmac.ts`:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

const WINDOW_MS = 5 * 60_000;

interface SignInput { version: number; method: string; path: string; nonce: string; ts: number; body: string; }
interface VerifyInput extends SignInput { signature: string; now: number; }

function canonical(i: SignInput): string {
  // Cobre versão/método/path/nonce/ts/body (REQ-6) — mais que o ${ts}.${body} do entitlement.
  return `${i.version}.${i.method}.${i.path}.${i.nonce}.${i.ts}.${i.body}`;
}

export function signVisProvision(secret: string, i: SignInput): string {
  return createHmac("sha256", secret).update(canonical(i)).digest("hex");
}

export function verifyVisProvision(secret: string, i: VerifyInput): boolean {
  if (!secret) return false; // fail-closed
  if (Math.abs(i.now - i.ts) > WINDOW_MS) return false;
  const expected = signVisProvision(secret, i);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from((i.signature || "").replace(/^sha256=/, ""), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 5: Rodar o teste — deve passar**

Run: `./node_modules/.bin/vitest run src/lib/__tests__/vis-provision-hmac.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/vis-provision-hmac.ts src/lib/__tests__/vis-provision-hmac.test.ts
git commit -m "feat(f2): HMAC do canal de provision (assina versão/método/path/nonce/ts/body)"
```

### Task A3: Núcleo `vis-provision-sync` (tx atômica das 5 tabelas + idempotência + colisão de email)

**Files:**
- Create: `src/lib/vis-provision-sync.ts`
- Test: `tests/vis-provision/provision-sync.test.ts` (integração, banco isolado)

- [ ] **Step 1: Ler `vis-entitlement-sync.ts` para espelhar idempotência e o registro de evento**

Run: `sed -n '200,260p;369,400p' src/lib/vis-entitlement-sync.ts`
Expected: ver `applyEntitlementSnapshot` (dedupe por eventId `onConflictDoNothing`, `findClinic`, upsert condicional) e `findEvent`. O provision reusa `visEntitlementEvents` com `eventId = provision:{clinicId}`.

- [ ] **Step 2: Escrever o teste de integração que falha** (banco isolado — exige `TEST_DATABASE_URL`)

Create `tests/vis-provision/provision-sync.test.ts`. Cobre: (1) provisionamento feliz cria clinics+users+users_to_clinics+clinic_entitlements+evento; (2) `accounts` NÃO é criado (só no aceite); (3) idempotência: 2º call mesmo clinicId/eventId = no-op, sem duplicar; (4) fail-open fechado: clinic_entitlements sempre presente na mesma tx; (5) colisão de email já-existente → 409 identity_conflict; (6) corrida: 2 provisions com mesmo email → 2º viola unique → resultado terminal (não retryable).

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db"; // confirmar o export real do client Drizzle
import { applyProvision } from "@/lib/vis-provision-sync";
// helpers de limpeza do banco de teste — seguir o padrão de tests/vis-entitlements/*

const base = (over: Partial<any> = {}) => ({
  eventId: `provision:${over.clinicId ?? "clinic-A"}`,
  requestId: "req-1",
  requestedByAdminId: "admin-1",
  clinicId: "11111111-1111-1111-1111-111111111111",
  visCompanyId: "company-A",
  clinicName: "Clínica Teste",
  admin: { email: "dono@clinica.test", name: "Dono", role: "admin" as const },
  entitlement: { writeAllowed: true, planTier: "clinic_full", sourceRevision: "1" },
  ...over,
});

describe("applyProvision (integração, banco isolado)", () => {
  beforeEach(async () => { /* truncar clinics/users/accounts/users_to_clinics/clinic_entitlements/clinic_invites/vis_entitlement_events de teste */ });

  it("provisiona feliz: cria clínica, user admin, vínculo e entitlement — SEM account", async () => {
    const r = await applyProvision(base());
    expect(r.applied).toBe(true);
    // asserts: clinic existe; user admin existe; users_to_clinics(role=admin); clinic_entitlements(writeAllowed=true, planTier=clinic_full)
    // asserts: NÃO há linha em accounts para esse user (credencial só no aceite do convite)
  });

  it("idempotente: 2º call com mesmo eventId é no-op (não duplica user/vínculo)", async () => {
    await applyProvision(base());
    const r2 = await applyProvision(base());
    expect(r2.applied).toBe(true); // replay idempotente retorna sucesso
    // assert: exatamente 1 user, 1 vínculo, 1 entitlement
  });

  it("fail-open fechado: entitlement nasce na MESMA tx da clínica", async () => {
    await applyProvision(base());
    // assert: existe clinic_entitlements para o clinicId (nunca clínica sem espelho)
  });

  it("colisão de email já-existente em outra clínica → identity_conflict (terminal)", async () => {
    await applyProvision(base({ clinicId: "22222222-2222-2222-2222-222222222222", eventId: "provision:22222222-2222-2222-2222-222222222222" }));
    const r = await applyProvision(base({ clinicId: "33333333-3333-3333-3333-333333333333", eventId: "provision:33333333-3333-3333-3333-333333333333" })); // mesmo email
    expect(r.applied).toBe(false);
    expect(r.terminal).toBe(true);
    expect(r.error).toBe("identity_conflict");
  });

  it("REQ-4: evento com applied=false NÃO envenena — retry posterior APLICA", async () => {
    // Simula o caso provision-vs-entitlement: um evento do mesmo clinicId foi gravado
    // com applied=false (ex.: entitlement chegou antes e deu clinic_not_found).
    // O dedupe do provision NÃO pode tratar "evento existe" como idempotente-aplicado;
    // só um evento applied=true bloqueia re-execução.
    // (setup: inserir manualmente uma linha em vis_entitlement_events com o mesmo
    //  eventId e applied=false, depois chamar applyProvision e exigir applied=true.)
    // assert: applyProvision RE-EXECUTA e cria a clínica (não devolve no-op).
  });
});
```

- [ ] **Step 3: Rodar — deve falhar**

Run: `NODE_ENV=test ./node_modules/.bin/vitest run tests/vis-provision/provision-sync.test.ts`
Expected: FAIL (`@/lib/vis-provision-sync` não existe). Se falhar com "TEST_DATABASE_URL ausente", PARE e peça ao dono para confirmar o `.env.test` (banco isolado) — nunca cair para o banco padrão.

- [ ] **Step 4: Implementar `applyProvision`**

Create `src/lib/vis-provision-sync.ts`. Requisitos (spec §4/§5):
- Assinatura: `applyProvision(input): Promise<{ applied: boolean; appliedRevision?: string; terminal?: boolean; error?: string }>`.
- **Dedupe correto (REQ-4):** o replay só é no-op se existir evento com `applied=true` para o `eventId`. Um evento existente com `applied=false` (ex.: entitlement chegou antes → clinic_not_found gravou applied=false) NÃO bloqueia — o provision re-executa e grava applied=true. NÃO usar "evento existe ⇒ idempotente"; checar a coluna `applied`. (Confirmar no `vis-entitlement-sync.ts` como `applied` é gravado.)
- **Id do user:** `users.id` é `text` SEM default no schema (o script sombra usa string própria). Gerar com `crypto.randomUUID()` (string) — NÃO usar `defaultRandom()` do Drizzle (a coluna não tem default). `accounts` NÃO nasce aqui.
- **Uma tx Drizzle** (`db.transaction`): registra o evento + insere `clinics` (onConflictDoNothing por id) + `users` (admin, SEM account) + `users_to_clinics` (role=admin) + `clinic_entitlements` (writeAllowed/planTier do input, na MESMA tx). O evento e as 5 escritas no mesmo `db.transaction` (REQ-4/REQ-5).
- **Colisão de email:** antes de inserir user, checar se `lower(email)` já existe. Se existe e o vínculo NÃO é exatamente `(clinicId ↔ visCompanyId)` deste request → retornar `{applied:false, terminal:true, error:"identity_conflict"}` SEM escrever (REQ-2). Capturar violação de `users_lower_email_key` como terminal também (corrida REQ-2b).
- **Reprovision:** clinicId já existe COM o mesmo vínculo → no-op idempotente `{applied:true}` (nunca re-executa, nunca toca PHT).
- NÃO cria `accounts` (credencial nasce no aceite do convite — Marco 2).

> Espelhe os helpers de `vis-entitlement-sync.ts` (findClinic, findEvent) e o client `db`. Confirme nomes reais das tabelas Drizzle no schema.

- [ ] **Step 5: Rodar — deve passar**

Run: `NODE_ENV=test ./node_modules/.bin/vitest run tests/vis-provision/provision-sync.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 6: Commit**

```bash
git add src/lib/vis-provision-sync.ts tests/vis-provision/provision-sync.test.ts
git commit -m "feat(f2): applyProvision — tx atômica 5 tabelas, idempotente, colisão email terminal"
```

### Task A4: Endpoint `POST /api/internal/vis/provision` (HMAC + guard-rail de host + delega)

**Files:**
- Create: `src/app/api/internal/vis/provision/route.ts`
- Test: `tests/vis-provision/route.test.ts`

- [ ] **Step 1: Ler a rota de entitlements para espelhar estrutura e o allowlist do proxy**

Run: `sed -n '1,70p' src/app/api/internal/vis/entitlements/route.ts` ; `grep -n "internal/vis" src/proxy.ts 2>/dev/null || grep -rn "internal/vis" src/middleware.ts 2>/dev/null`
Expected: ver como a rota lê headers, verifica HMAC, retorna 401/422; e confirmar que `/api/internal/vis/**` está liberado no gate de auth (a rota é HMAC, não sessão).

- [ ] **Step 2: Escrever o teste da rota que falha**

Create `tests/vis-provision/route.test.ts`. Cobre: (1) HMAC inválido → 401; (2) payload SEM `requestedByAdminId` → 400 (REQ-6); (3) host fora da allowlist → 403 `host_not_allowed` (REQ-7); (4) feliz → 200 `{applied:true}`; (5) colisão de email → 409 `identity_conflict`. (Pode mockar `applyProvision` para os casos de HMAC/host e usar o banco real só no feliz.)

- [ ] **Step 3: Rodar — deve falhar** (rota não existe → 404)

Run: `NODE_ENV=test ./node_modules/.bin/vitest run tests/vis-provision/route.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar a rota**

Create `src/app/api/internal/vis/provision/route.ts`:
- Ler headers `x-vis-timestamp`, `x-vis-nonce`, `x-vis-signature`; `verifyVisProvision(secret, {version, method:"POST", path:"/api/internal/vis/provision", nonce, ts, body:rawBody, signature, now:Date.now()})` com secret `process.env.VIS_DOMUS_PROVISION_SECRET`. Falha → 401.
- **Guard-rail de host (REQ-7):** função `assertDbHostAllowed()` — extrai o host de `process.env.DATABASE_URL` e recusa (403 `host_not_allowed`) se não estiver numa allowlist derivada do ambiente (ex.: `ep-dawn-haze` em test, `ep-odd-credit` em prod). Fail-closed. Ver Step 5.
- Validar payload: `requestedByAdminId` obrigatório (400 se ausente), `clinicId` uuid, `admin.email` presente.
- Delegar em `applyProvision`. Mapear: `{applied:true}` → 200 `{applied:true, appliedRevision}`; `{terminal:true, error:"identity_conflict"}` → 409; erro transitório → 422.

- [ ] **Step 5: Implementar `assertDbHostAllowed` (guard-rail de ambiente)**

No mesmo arquivo ou `src/lib/db-host-guard.ts`:

```typescript
// REQ-7: recusa se o DATABASE_URL não bate com a allowlist do ambiente.
// Mais robusto que checar NODE_ENV (que pode vir errado). Fail-closed.
const ALLOWED_HOST_FRAGMENTS: Record<string, string[]> = {
  test: ["ep-dawn-haze"],
  production: ["ep-odd-credit"],
};
export function isDbHostAllowed(dbUrl = process.env.DATABASE_URL ?? "", env = process.env.NODE_ENV ?? "development"): boolean {
  const allowed = ALLOWED_HOST_FRAGMENTS[env];
  if (!allowed) return false; // ambiente desconhecido → fail-closed
  return allowed.some((frag) => dbUrl.includes(frag));
}
```

Com teste unitário: `test` só aceita `ep-dawn-haze`; `production` só `ep-odd-credit`; `development`/desconhecido → false.

- [ ] **Step 6: Rodar — deve passar**

Run: `NODE_ENV=test ./node_modules/.bin/vitest run tests/vis-provision/`
Expected: PASS (route + sync + hmac).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/internal/vis/provision/route.ts src/lib/db-host-guard.ts tests/vis-provision/route.test.ts
git commit -m "feat(f2): endpoint /provision (HMAC + guard-rail de host + delega applyProvision)"
```

### Task A5: Verificação da Parte A (Domus)

- [ ] Typecheck: `./node_modules/.bin/tsc --noEmit` — expected: 0 erros.
- [ ] Suíte nova + a de entitlements (regressão): `NODE_ENV=test ./node_modules/.bin/vitest run tests/vis-provision tests/vis-entitlements` — expected: todos passam (baseline era 44 em entitlements).
- [ ] Build: `./node_modules/.bin/next build` — expected: sucesso. (Se pesado, ao menos o typecheck acima.)
- [ ] Commit de qualquer resto. **NÃO fazer push nem pedir deploy da Parte A ainda** — o deploy do Domus acontece no fim do Marco 1, junto da aplicação da migração em prod pelo dono.

---

## PARTE B — VIS (motor comum + outbox + convite + fast-path)

> Detalhada após a Parte A estar verde. Ver §4 Marco 1 e §6 da spec. Resumo das tasks (a expandir com código completo quando a Parte A fechar, para o contrato §6.1 estar exercitado de verdade):
> - **B1:** migração Vis (SQL entregue; dono aplica em prod) — `provisioningState` enum + `provisioningAttemptId` + `ProvisioningOutbox` (+`failureReason`).
> - **B2:** `create-tenant-company.service.ts` — extrair o motor comum; testes de que cria ótica E medical pelo mesmo caminho; para medical aloca clinicId + enfileira outbox na mesma tx; NÃO grava EntitlementRevision (triggers).
> - **B3:** `clinic-invite.ts` — token hash, TTL 72h, amarrado a clinicId/email/role/nonce; reenvio invalida antigo.
> - **B4:** `vis-provision-client.ts` — assina (signVisProvision) e POSTa ao Domus, timeout 5s; fast-path.
> - **B5:** `provisioning-outbox.service.ts` — worker: backoff exp (base 30s, teto 1h), maxAttempts=10, terminal → PROVISION_FAILED + alerta.
> - **B6:** ligar no `create/route.ts` do admin; máquina de estados com attemptId; e-mail do convite SUPRIMIDO por flag `MEDICAL_INVITE_EMAIL_ENABLED=false`.
> - **B7:** verificação Vis (tsc + vitest full + build).

---

## Final Task: Verificação integrada do Marco 1 (MANDATORY)

- [ ] **Domus:** tsc 0 erros + `tests/vis-provision` e `tests/vis-entitlements` verdes.
- [ ] **Vis:** tsc 0 erros + suíte completa verde + build ok.
- [ ] **Contrato:** um teste end-to-end (pode ser no Vis, mockando a rede) confirma que o payload que o `vis-provision-client` gera casa com o que a rota `/provision` espera (§6.1).
- [ ] **Migração prod (dono):** só depois de tudo verde no isolado, dono aplica a migração do Domus em prod (`ep-odd-credit`) e a do Vis, cada uma com `!`, ANTES do push do código.
- [ ] **Deploy:** dono confirma `VIS_DOMUS_PROVISION_SECRET` nos dois projetos Vercel; então push de cada branch dispara o deploy.
- [ ] **Validação do Marco 1:** super admin cria um cliente Medical de teste → clínica nasce no Domus (banco isolado em homologação) → convite gravado (verificável no banco), e-mail não disparado (flag off). Sem rodar script.
