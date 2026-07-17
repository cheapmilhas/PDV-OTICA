# Sprint 1 — Domus como cliente nº 1 (plano de execução code-complete)

> **Sub-skill:** executar com subagent-driven-development ou executing-plans, tarefa a tarefa. Ao concluir cada tarefa: marcar checkbox, atualizar o índice em `2026-07-17-vis-medical-sprints.md`, commitar.

**Objetivo:** a Clínica Domus Saúde aparece no `/admin` (seletor Vis Medical) como cliente ativo em plano interno R$ 0, e uma mudança de assinatura no Vis reflete em `clinic_entitlements` no Domus — em modo sombra, sem bloquear nada.

**Premissas decididas:** D1 = plano interno R$ 0, conta NÃO pagante (não conta como venda). Clínica real no Domus = `7110db1b-528b-4451-a2c4-3581f370b9df` (116 pacientes). `clinic_entitlements` já existe e está vazia.

**Contrato de segurança e payload (fechado após revisão do Codex):**

Headers do webhook `POST`:
- `x-vis-timestamp`: epoch ms.
- `x-vis-signature`: `hmac-sha256(secret, timestamp + "." + rawBody)` em hex.
- Rejeita se `|now - timestamp| > 5min` ou assinatura inválida (comparação em tempo constante).
- `rawBody = await request.text()` ANTES de qualquer parse (o Vis já faz isso em `webhooks/asaas/route.ts:119`). NUNCA chamar `request.json()` antes.

Payload (JSON) — inclui TODOS os campos que `clinic_entitlements` exige (`0040:21`):
```json
{
  "version": 1,
  "eventId": "<cuid>",              // idempotência (corpo, não header)
  "sourceUpdatedAt": "<ISO>",      // = max(Subscription.updatedAt, Company.updatedAt). É o relógio do estado que o Domus usa para descartar snapshot fora de ordem. ⚠️ Codex: block/unblock muda Company.isBlocked (lido por checkSubscription) MAS não toca Subscription.updatedAt — usar só a Subscription faria o snapshot novo ter timestamp igual ao antigo e ser descartado. Por isso é o MAIOR dos dois updatedAt.
  "generatedAt": "<ISO>",          // instante do envio (log/debug apenas)
  "visCompanyId": "<Company.id>",  // obrigatório no schema
  "domusClinicId": "<uuid>",       // resolve clinic_id no Domus
  "subscriptionStatus": "ACTIVE",
  "planName": "Interno — Domus",
  "entitlement": { "writeAllowed": true, "reason": "ACTIVE" }
}
```
Segredo compartilhado `VIS_DOMUS_WEBHOOK_SECRET` (mesmo valor nos 2 projetos; criar no PAINEL — `vercel env add` grava vazio). Fail-open é do Sprint 2; aqui o Domus só grava o espelho.

**⚠️ `planName` (Codex):** `checkSubscription` só retorna `planName` no caminho normal — nos ramos kill-switch/bypass/bloqueio ele vem `undefined` (`subscription.ts:34,45,77,87`). O publisher/pull busca o `planName` à parte (`Company → Subscription → Plan.name`) e o inclui no payload; NÃO depende do retorno de `checkSubscription` para o metadado.

**⚠️ Efeito colateral do pull (Codex):** `checkSubscription` faz `UPDATE status TRIAL→TRIAL_EXPIRED` (`subscription.ts:139`). Logo o pull GET NÃO é read-only puro. É idempotente e a transição é legítima (aconteceria no próximo request do tenant de qualquer forma), mas **documentar** e garantir que o cron de pull não rode com frequência que cause corrida. Aceito para o Sprint 1.

**Gotchas:** migração = SQL à mão + dry-run + apply (nunca push). Scripts da raiz. Verificar banco após escrita.

---

## Task 1 — Plano interno R$ 0 + cliente nº 1 (pela UI, sem código)

**Não há código.** É operação no painel, documentada aqui para o executor conferir o resultado no banco.

**⚠️ Ordem corrigida (Codex):** a tela `/admin/clientes/novo` lista SÓ `isActive:true` (`novo/page.tsx:11`), e o `POST /api/admin/plans` nem aceita `isActive` (default `true`, `route.ts:16`). Então: criar o plano ATIVO → selecionar no cliente → só DEPOIS desativar o plano (via UPDATE direto ou UI de edição de planos).

- [ ] **1.1** Criar o `Plan` interno ATIVO: `/admin/configuracoes/planos` → `name: "Interno — Domus"`, `slug: "interno-domus"`, `priceMonthly: 0`, `priceYearly: 0`, `status: "ACTIVE"`. Nasce `isActive:true` (default) — necessário para aparecer no passo 1.2.
- [ ] **1.2** Criar o cliente: `/admin/clientes/novo` → `tradeName: "Clínica Domus Saúde"`, produto **VIS_MEDICAL**, plano `interno-domus`, trial 0 (nasce ACTIVE). NÃO reaproveitar `vismed-dev-company`.
- [ ] **1.2b** Desativar o plano da landing: `UPDATE "Plan" SET "isActive"=false WHERE slug='interno-domus'` (o cliente já vinculado não é afetado; o plano só some da lista de novos cadastros e da landing).
- [ ] **1.3 Verificar no banco:**

Run (da raiz): `node -e "require('dotenv').config();const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRawUnsafe(\`SELECT c.id,c.name,c.\"platformProduct\",s.status,pl.\"priceMonthly\" FROM \"Company\" c JOIN \"Subscription\" s ON s.\"companyId\"=c.id JOIN \"Plan\" pl ON pl.id=s.\"planId\" WHERE c.\"platformProduct\"='VIS_MEDICAL'\`).then(r=>{console.log(JSON.stringify(r,null,1));return p.\$disconnect()})"`

Expected: 1 linha, `platformProduct: VIS_MEDICAL`, `status: ACTIVE`, `priceMonthly: 0`. **Anotar o `Company.id` gerado** — é o `<VIS_COMPANY_ID>` usado nas tarefas seguintes.

---

## Task 2 — Vincular identidade (T1.2)

**Files:** Create `scripts/link-domus-clinic.cjs`

- [ ] **2.1** Escrever o script de vínculo (idempotente, com guardas):

```javascript
// scripts/link-domus-clinic.cjs — vincula a Company VIS_MEDICAL à clínica real do Domus.
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();
const DOMUS_CLINIC_ID = "7110db1b-528b-4451-a2c4-3581f370b9df"; // Domus Saude, 116 pacientes
async function main() {
  const p = new PrismaClient();
  // Idempotente: se JÁ está vinculado ao id certo, sucesso e sai.
  const jaOk = await p.$queryRawUnsafe(
    `SELECT id FROM "Company" WHERE "platformProduct"='VIS_MEDICAL' AND "domusClinicId"=$1`, DOMUS_CLINIC_ID);
  if (jaOk.length === 1) { console.log("JÁ VINCULADO (idempotente):", jaOk[0].id); await p.$disconnect(); return; }

  const alvo = await p.$queryRawUnsafe(
    `SELECT id, name FROM "Company" WHERE "platformProduct"='VIS_MEDICAL' AND "domusClinicId" IS NULL`);
  if (alvo.length !== 1) {
    console.error("ABORTADO: esperava exatamente 1 Company VIS_MEDICAL sem vínculo, achei", alvo.length, alvo);
    process.exit(1);
  }
  const companyId = alvo[0].id;
  // Guarda: ninguém mais pode já apontar para essa clínica.
  const dup = await p.$queryRawUnsafe(
    `SELECT id FROM "Company" WHERE "domusClinicId"=$1`, DOMUS_CLINIC_ID);
  if (dup.length) { console.error("ABORTADO: clínica já vinculada a", dup); process.exit(1); }
  await p.$executeRawUnsafe(
    `UPDATE "Company" SET "domusClinicId"=$1 WHERE id=$2`, DOMUS_CLINIC_ID, companyId);
  const check = await p.$queryRawUnsafe(
    `SELECT id, name, "domusClinicId" FROM "Company" WHERE id=$1`, companyId);
  console.log("VINCULADO:", JSON.stringify(check[0]));
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **2.2** Rodar: `node scripts/link-domus-clinic.cjs` — Expected: `VINCULADO` com `domusClinicId: 7110db1b...`
- [ ] **2.3** Commit: `git add scripts/link-domus-clinic.cjs && git commit -m "chore(vis-medical): vincula Company VIS_MEDICAL à clínica real do Domus (T1.2)"`

---

## Task 3 — Projetor canônico (T1.3)

**Files:** Create `src/lib/entitlement-projection.ts`, `src/lib/__tests__/entitlement-projection.test.ts`

- [ ] **3.1 Teste primeiro** (`entitlement-projection.test.ts`): cobre os 6 estados. `computeEntitlement` recebe o resultado de `checkSubscription` (ou uma projeção mínima da Subscription) e devolve o DTO do espelho.

```typescript
import { describe, it, expect } from "vitest";
import { projectEntitlement } from "@/lib/entitlement-projection";

const base = { planName: "Interno — Domus", subscriptionStatus: "ACTIVE" as const };

describe("projectEntitlement", () => {
  it("ACTIVE → escreve", () => {
    expect(projectEntitlement({ ...base, allowed: true, status: "ACTIVE" }).writeAllowed).toBe(true);
  });
  it("TRIAL → escreve", () => {
    expect(projectEntitlement({ ...base, allowed: true, status: "TRIAL" }).writeAllowed).toBe(true);
  });
  it("PAST_DUE → escreve (ainda live)", () => {
    expect(projectEntitlement({ ...base, allowed: true, status: "PAST_DUE" }).writeAllowed).toBe(true);
  });
  it("TRIAL_EXPIRED → NÃO escreve", () => {
    const r = projectEntitlement({ ...base, allowed: false, status: "TRIAL_EXPIRED" });
    expect(r.writeAllowed).toBe(false);
    expect(r.reason).toContain("TRIAL_EXPIRED");
  });
  it("SUSPENDED → NÃO escreve", () => {
    expect(projectEntitlement({ ...base, allowed: false, status: "SUSPENDED" }).writeAllowed).toBe(false);
  });
  it("CANCELED → NÃO escreve", () => {
    expect(projectEntitlement({ ...base, allowed: false, status: "CANCELED" }).writeAllowed).toBe(false);
  });
});
```

- [ ] **3.2 Rodar o teste — Expected: FAIL** (`projectEntitlement` não existe).
- [ ] **3.3 Implementar** (`entitlement-projection.ts`): função PURA, sem I/O. Envelopa a decisão de `checkSubscription` — NÃO reimplementa regra.

```typescript
import type { SubscriptionStatus } from "@prisma/client";

export interface EntitlementInput {
  allowed: boolean;                                  // vem de checkSubscription
  status: SubscriptionStatus | "NO_SUBSCRIPTION";
  planName?: string;
  subscriptionStatus?: string;
}
export interface EntitlementDTO {
  writeAllowed: boolean;
  reason: string;
  subscriptionStatus: string;
  planName: string | null;
}

/** Projeta a decisão canônica do Vis no DTO que o Domus consome. Pura. */
export function projectEntitlement(input: EntitlementInput): EntitlementDTO {
  return {
    writeAllowed: input.allowed,
    reason: input.status,                             // ex.: "TRIAL_EXPIRED", "SUSPENDED"
    subscriptionStatus: input.status,
    planName: input.planName ?? null,
  };
}
```

- [ ] **3.4 Rodar — Expected: PASS (6 testes).**
- [ ] **3.5 Commit.**

---

## Task 4 — Publisher no Vis (T1.4)

**Files:** Create `src/lib/vis-domus-publisher.ts`, `src/app/api/internal/domus/entitlements/[clinicId]/route.ts` (pull por clínica), `src/app/api/internal/domus/entitlements/route.ts` (**listagem para bootstrap do cron** — Codex: sem isso o Domus não descobre clínica cujo 1º webhook falhou); modificar o ponto único de escrita de Subscription.

- [ ] **4.1** `vis-domus-publisher.ts`: monta o payload (projeção + `eventId` = `cuid`, `generatedAt`, `domusClinicId`), assina HMAC, faz `POST` ao Domus (`${DOMUS_WEBHOOK_URL}/api/internal/vis/entitlements`). Timeout curto (5 s) e **não lança** em falha de rede — só loga e marca para o pull de reparação pegar (a entrega garantida é o cron do Domus). Só publica para Company `VIS_MEDICAL` com `domusClinicId` não-nulo.
- [ ] **4.2** Endpoint de pull `GET /api/internal/domus/entitlements/[clinicId]`: autenticado pelo MESMO segredo (header `x-vis-domus-secret` comparado em tempo constante), resolve `Company` por `domusClinicId`, roda `checkSubscription(companyId)` → `projectEntitlement` → devolve o DTO completo (com `sourceUpdatedAt = max(Subscription.updatedAt, Company.updatedAt)` — ver contrato — e `planName` buscado à parte). 404 se não achar. (Codex: sem auth aqui é vazamento de estado contratual.)
- [ ] **4.2b** Endpoint de listagem `GET /api/internal/domus/entitlements` (sem id): mesmo auth, retorna `[{domusClinicId, visCompanyId}]` de toda Company VIS_MEDICAL com `domusClinicId` não-nulo. É o bootstrap que o cron do Domus usa para descobrir clínicas ainda sem espelho. Teste: auth obrigatório; lista só VIS_MEDICAL vinculadas.
- [ ] **4.3** Ponto único de publicação: criar helper `publishEntitlementForCompany(companyId)` e chamá-lo (após commit) nos call-sites que mudam status. **Todos os call-sites que mexem em Subscription/isBlocked** (Codex mapeou): `admin/clientes/[id]/actions` (block/unblock/reactivate/change-plan/cancel — `actions/route.ts:31,55,82,199`), `cron/subscription-watch`, `cron/dunning`, `billing/checkout`, `admin/faturas/[id]/workflow`, `admin/clientes/create`.
  **⚠️ Não cobrir só trial/create.** O gate do Sprint 1 é "mudança reflete" e o E2E (6.2) usa **block/unblock** — então `actions/route.ts` (block/unblock) é OBRIGATÓRIO no Sprint 1. Os call-sites de cobrança real (checkout, faturas, dunning) podem ficar como TODO comentado APENAS se não houver medical pagante ainda — mas o cron de pull diário cobre o atraso, então o espelho nunca fica permanentemente velho. Documentar cada call-site não coberto com `// TODO(sprint3): publicar entitlement — hoje sem medical pagante`.
- [ ] **4.4** Testes: assinatura HMAC determinística; pull rejeita sem/へcom segredo errado; pull 404 para clínica inexistente; publisher não lança em timeout.
- [ ] **4.5** Commit.

---

## Task 5 — Receptor no Domus (T1.5)

**Files (Domus):** Create `src/app/api/internal/vis/entitlements/route.ts`, `src/app/api/cron/sync-vis-entitlements/route.ts`, lib de verificação HMAC.

- [ ] **5.1** `POST /api/internal/vis/entitlements`: valida HMAC + janela 5 min; idempotência — se `eventId` já em `vis_entitlement_events`, responde 200 sem reaplicar; descarta se `source_updated_at` <= o gravado (fora de ordem); faz upsert em `clinic_entitlements` (por `clinic_id`), grava o evento como `applied`.
  **Resolução de clínica (Codex):** ANTES do upsert, `SELECT id FROM clinics WHERE id = domusClinicId`. Se não existir → responder **422** (não 500) com `{error:"clinic_not_found"}` e gravar o evento como `applied:false` — a FK de `clinic_entitlements` faria o upsert explodir em 500 sem isso. Teste dedicado para esse caso.
- [ ] **5.2** Cron `GET /api/cron/sync-vis-entitlements` protegido por `Authorization: Bearer CRON_SECRET` (padrão do Domus — `send-reminders/route.ts:7`, `CRON_SECRET` já obrigatório em `env.ts:27`). Para cada linha JÁ em `clinic_entitlements`, faz `GET` autenticado ao pull do Vis e reaplica o upsert; alerta se `synced_at` > 24 h. Registrar em `vercel.json` (Domus já tem crons ali), diário.
  **⚠️ Codex:** o Domus só conhece clínicas que JÁ têm espelho — não há tabela de mapeamento reversa. Se o PRIMEIRO webhook de uma clínica falhar, o cron não a encontra. Mitigação no Sprint 1 (1 clínica só): o publisher do Vis dispara o webhook na criação/vínculo (Task 4) E há um **endpoint de listagem** no Vis (`GET /api/internal/domus/entitlements` sem id → lista todas as Company VIS_MEDICAL com `domusClinicId`), que o cron do Domus usa para o bootstrap inicial. Assim o cron puxa a lista do Vis, não depende de já ter o espelho.
- [ ] **5.3** Testes (Domus, vitest): replay do mesmo eventId não reaplica; snapshot fora de ordem é descartado; HMAC inválido → 401; primeiro snapshot cria a linha; upsert atualiza.
- [ ] **5.4** Migração se precisar de índice extra — via dry-run + apply (padrão 0041). Provavelmente nenhuma (índices já criados no 0040).
- [ ] **5.5** Commit (Domus).

---

## Task 6 — Verificação ponta-a-ponta (sombra) e fechamento

- [ ] **6.1** Setar `VIS_DOMUS_WEBHOOK_SECRET` (mesmo valor nos 2 projetos, pelo PAINEL) + `DOMUS_WEBHOOK_URL` no Vis + `VIS_PULL_URL` no Domus. Deploy dos dois.
- [ ] **6.2** E2E sombra: no `/admin` (seletor Vis Medical) mudar a assinatura da Clínica Domus Saúde. **NÃO usar `extend_trial`** — ela exige status TRIAL e o cliente nasce ACTIVE (`actions/route.ts:69`). Usar **bloquear/desbloquear** (a ação `block` seta `isBlocked`, que `checkSubscription` lê em `subscription.ts:78` → `allowed:false`) OU trocar de plano. Ciclo: bloquear → confirmar no Domus que `clinic_entitlements.write_allowed=false`; desbloquear → confirmar `write_allowed=true`. Rodar o cron manualmente e confirmar idempotência: o segundo disparo NÃO duplica evento (`vis_entitlement_events` não cresce) e NÃO muda a DECISÃO (`write_allowed`/`reason` estáveis). **`synced_at` DEVE atualizar** a cada sync bem-sucedido — é o que alimenta o alerta de defasagem > 24 h (Codex: mantê-lo fixo quebraria o alerta). Ou seja: idempotência é sobre a decisão e o evento, não sobre `synced_at`.
- [ ] **6.3** Confirmar que **nenhuma escrita clínica é bloqueada** (guard só existe no Sprint 2) — o Domus só gravou o espelho.
- [ ] **6.4** tsc 0 + suíte nos 2 repos. Atualizar índice do plano-mãe. Commit + push + deploy.

**Gate do Sprint 1:** Domus visível como cliente ativo no `/admin` sob Vis Medical · mudança de assinatura no Vis reflete em `clinic_entitlements` · idempotência e fora-de-ordem comprovados · zero bloqueio ativo.
