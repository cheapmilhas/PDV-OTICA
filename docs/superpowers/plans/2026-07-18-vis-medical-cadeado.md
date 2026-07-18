# Sprint 2 — "O Cadeado" — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear a ESCRITA clínica de criação de estado novo quando a clínica está inadimplente, lendo o espelho `clinic_entitlements`, em modo observação (não liga o enforce nesta entrega).

**Architecture:** Guard de leitura pura `assertClinicWriteAllowed(clinicId)` fail-open por construção. Aplicado via um client irmão `billingGuardedClinicActionClient` nas actions puramente criadoras, e inline nas actions upsert/públicas. O receptor do sync (`upsertMirror`) passa a armar `denyVerifiedUntil = syncedAt + 48h` em snapshot `writeAllowed=false`. Teste de arquitetura trava a fiação. Leitura de prontuário NUNCA passa pelo guard (CFM 1.821).

**Tech Stack:** Next 16 (App Router, server actions via next-safe-action), drizzle-orm + pg + Neon. Testes: vitest com fake DB (não há banco de dev isolado — DATABASE_URL aponta pra prod; NUNCA testar contra banco real).

**Environment notes:**
- **Worktree:** `~/SISTEMACLINICADOMUS-cadeado` (branch `feature/cadeado-billing-guard`). `node_modules` e `.env` são symlinks para o repo principal. Rodar tudo daí.
- **NÃO ligar o enforce nesta entrega.** Toda a máquina é entregue com `ENFORCE_VIS_ENTITLEMENTS` != "true" → modo observação. Ligar é decisão separada após medição (D5).
- **NÃO tocar** `protectedWithClinicActionClient` (123 arquivos, base de leitura de prontuário).
- Spec fonte: `docs/superpowers/specs/2026-07-18-vis-medical-cadeado-design.md` (no repo Vis / PDV OTICA). Decisões D1-D6 e a lista pinada de 16 actions estão lá.
- Migração: **nenhuma** — a coluna `deny_verified_until` já existe (migração 0040). Só passa a ser escrita.
- Alto risco: Codex revisa cada diff na fase de código.

---

## Task 1: Constantes e a lista pinada de actions guardadas

**Files:**
- Create: `src/lib/entitlement/guarded-actions.ts`

- [ ] **Step 1: Criar o módulo com a lista pinada** (fonte única que o teste de arquitetura trava).

```typescript
// src/lib/entitlement/guarded-actions.ts
/**
 * Fonte ÚNICA das actions guardadas pelo cadeado (Sprint 2). O teste de
 * arquitetura (Task 8) trava esta lista contra o código real. Derivada por
 * client + tabela de escrita, não por nome. Ver spec D1/D6.
 *
 * NÃO adicionar action de CRIAÇÃO de estado clínico/faturável nova sem incluir
 * aqui E aplicar o guard — o teste de arquitetura reprova o CI se divergir.
 */

/** (a) Criadoras puras — guard via client `billingGuardedClinicActionClient`. */
export const GUARDED_VIA_CLIENT = [
  "add-appointment",
  "create-appointment-procedure",
  "create-medical-record",
  "create-prescription",
  "create-optical-prescription",
  "create-certificate",
  "create-aesthetic-consent",
  "create-payment-transaction",
  "create-cash-movement",
  "create-attachment",
  "apply-bundle-to-appointment",
  "create-delivered-report-attachment",
] as const;

/** (b) Upserts clínicos — guard INLINE só quando `input.id` ausente (criação). D6. */
export const GUARDED_INLINE_UPSERT = [
  "upsert-medical-record",
  "upsert-aesthetic-record",
  "upsert-specialty-record-data",
] as const;

/** (c) Sem client (clinicId no input) — guard inline + resposta uniforme. */
export const GUARDED_INLINE_PUBLIC = ["add-public-appointment"] as const;

/** Leituras de prontuário que NUNCA podem ser guardadas (CFM 1.821). */
export const PROTECTED_READS = [
  "get-medical-record",
  "list-patient-records",
  "get-patient-timeline",
  "get-allowed-prescription-types",
] as const;
```

- [ ] **Step 2: Verificar tsc**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add src/lib/entitlement/guarded-actions.ts
git commit -m "feat(cadeado): lista pinada das actions guardadas (fonte única)"
```

---

## Task 2: O guard `assertClinicWriteAllowed` (fail-open) + testes

**Files:**
- Create: `src/lib/entitlement/assert-write-allowed.ts`
- Test: `tests/entitlement/assert-write-allowed.test.ts`

- [ ] **Step 1: Escrever os testes falhando** (tabela-verdade do fail-open, deps injetável — sem banco real, padrão dos testes do sync).

```typescript
// tests/entitlement/assert-write-allowed.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateClinicWrite,
  type EntitlementRow,
  type GuardMode,
} from "@/lib/entitlement/assert-write-allowed";

const CLINIC = "7110db1b-528b-4451-a2c4-3581f370b9df";

function row(over: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    clinicId: CLINIC,
    writeAllowed: false,
    denyVerifiedUntil: new Date(Date.now() + 60_000), // fresco por padrão
    decisionReason: "SUSPENDED",
    ...over,
  };
}

const enforce: GuardMode = { enforce: true, bypassClinicIds: [] };

describe("evaluateClinicWrite — tabela-verdade fail-open", () => {
  it("NEGA só com linha + writeAllowed=false + denyVerifiedUntil>now", () => {
    expect(evaluateClinicWrite(row(), enforce, new Date()).outcome).toBe("deny");
  });
  it("libera se linha ausente (null)", () => {
    expect(evaluateClinicWrite(null, enforce, new Date()).outcome).toBe("allow");
  });
  it("libera se writeAllowed=true", () => {
    expect(evaluateClinicWrite(row({ writeAllowed: true }), enforce, new Date()).outcome).toBe("allow");
  });
  it("libera se denyVerifiedUntil vencido (bloqueio expirou → fail-open)", () => {
    const stale = row({ denyVerifiedUntil: new Date(Date.now() - 60_000) });
    expect(evaluateClinicWrite(stale, enforce, new Date()).outcome).toBe("allow");
  });
  it("libera se denyVerifiedUntil null", () => {
    expect(evaluateClinicWrite(row({ denyVerifiedUntil: null }), enforce, new Date()).outcome).toBe("allow");
  });
  it("libera se kill-switch off (enforce=false) mas marca would_block", () => {
    const r = evaluateClinicWrite(row(), { enforce: false, bypassClinicIds: [] }, new Date());
    expect(r.outcome).toBe("allow");
    expect(r.wouldBlock).toBe(true);
  });
  it("libera se clínica no bypass", () => {
    const r = evaluateClinicWrite(row(), { enforce: true, bypassClinicIds: [CLINIC] }, new Date());
    expect(r.outcome).toBe("allow");
  });
});
```

- [ ] **Step 2: Rodar — Expected: FAIL** (`evaluateClinicWrite` não existe).

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run tests/entitlement/assert-write-allowed.test.ts`
Expected: FAIL (import não resolve).

- [ ] **Step 3: Implementar** — a decisão PURA (`evaluateClinicWrite`) e o wrapper com I/O (`assertClinicWriteAllowed`).

```typescript
// src/lib/entitlement/assert-write-allowed.ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clinicEntitlementsTable } from "@/db/schema";
import { logger } from "@/lib/logger";

export interface EntitlementRow {
  clinicId: string;
  writeAllowed: boolean;
  denyVerifiedUntil: Date | null;
  decisionReason: string;
}
export interface GuardMode {
  enforce: boolean;
  bypassClinicIds: string[];
}
export interface GuardDecision {
  outcome: "allow" | "deny";
  /** true quando a decisão SERIA deny mas foi liberada (observação/kill-switch). */
  wouldBlock: boolean;
  reason: string;
}

/**
 * Decisão PURA do cadeado. Fail-open por construção: só devolve deny quando a
 * linha existe, writeAllowed=false e denyVerifiedUntil>now — E o enforce está
 * ligado e a clínica não está no bypass. Todo o resto é allow. Ver spec.
 */
export function evaluateClinicWrite(
  row: EntitlementRow | null,
  mode: GuardMode,
  now: Date,
): GuardDecision {
  // A condição de BLOQUEIO "cru" (antes de kill-switch/bypass).
  const wouldBlock =
    !!row &&
    row.writeAllowed === false &&
    row.denyVerifiedUntil !== null &&
    row.denyVerifiedUntil.getTime() > now.getTime();

  if (!wouldBlock) return { outcome: "allow", wouldBlock: false, reason: "ok" };

  const reason = row!.decisionReason || "blocked";
  if (mode.bypassClinicIds.includes(row!.clinicId)) {
    return { outcome: "allow", wouldBlock: true, reason: `bypass:${reason}` };
  }
  if (!mode.enforce) {
    return { outcome: "allow", wouldBlock: true, reason: `observe:${reason}` };
  }
  return { outcome: "deny", wouldBlock: true, reason };
}

function readMode(): GuardMode {
  return {
    enforce: process.env.ENFORCE_VIS_ENTITLEMENTS === "true",
    bypassClinicIds: (process.env.DOMUS_BILLING_BYPASS_CLINIC_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * Guard com I/O. Lê o espelho e aplica `evaluateClinicWrite`. FAIL-OPEN em
 * qualquer erro (try/catch → allow): impedir o médico por falha de infra é pior.
 * Em deny, lança erro com prefixo que `sanitizeServerError` deixa passar.
 */
export async function assertClinicWriteAllowed(clinicId: string): Promise<void> {
  const mode = readMode();
  let decision: GuardDecision;
  try {
    const row = await db.query.clinicEntitlementsTable.findFirst({
      where: eq(clinicEntitlementsTable.clinicId, clinicId),
      columns: { clinicId: true, writeAllowed: true, denyVerifiedUntil: true, decisionReason: true },
    });
    decision = evaluateClinicWrite(row ?? null, mode, new Date());
  } catch (err) {
    // Fail-open: erro de leitura do espelho NÃO bloqueia o médico.
    logger.error("CADEADO_GUARD_ERRO_FAIL_OPEN", err, { clinicId });
    return;
  }

  if (decision.wouldBlock) {
    // Log SEM PII de paciente — só clinicId + motivo (achado Codex).
    logger.warn(decision.outcome === "deny" ? "CADEADO_BLOCKED" : "CADEADO_WOULD_BLOCK", {
      clinicId,
      reason: decision.reason,
    });
  }
  if (decision.outcome === "deny") {
    throw new Error(
      "Não é possível concluir: a assinatura da clínica está pendente. " +
        "A leitura e a impressão de prontuários seguem normais; novos registros estão pausados. " +
        "Regularize para reativar.",
    );
  }
}
```

- [ ] **Step 4: Rodar — Expected: PASS (7 testes).**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run tests/entitlement/assert-write-allowed.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirmar o prefixo do erro passa pelo sanitizeServerError**

Run: `grep -n 'Não é possível' src/lib/next-safe-action.ts`
Expected: casa a linha 10 (`e.message.startsWith("Não é possível")`). Se não casar, ajustar o prefixo do erro no Step 3.

- [ ] **Step 6: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add src/lib/entitlement/assert-write-allowed.ts tests/entitlement/assert-write-allowed.test.ts
git commit -m "feat(cadeado): guard assertClinicWriteAllowed fail-open + testes tabela-verdade"
```

---

## Task 3: Client irmão `billingGuardedClinicActionClient`

**Files:**
- Modify: `src/lib/next-safe-action.ts` (adicionar ao final, sem tocar os clients existentes)

- [ ] **Step 1: Adicionar o client irmão** (após `doctorOnlyActionClient`, linha ~101).

```typescript
import { assertClinicWriteAllowed } from "@/lib/entitlement/assert-write-allowed";

// Cadeado (Sprint 2): client de ESCRITA de criação de estado faturável.
// Deriva da MESMA base de clínica, mas roda o guard antes da action. NÃO troca
// o protectedWithClinicActionClient (leitura de prontuário passa por ele).
export const billingGuardedClinicActionClient = protectedWithClinicActionClient.use(
  async ({ next, ctx }) => {
    await assertClinicWriteAllowed(ctx.user.clinic.id);
    return next({ ctx });
  },
);
```

Coloque o `import` no topo do arquivo junto aos outros imports.

- [ ] **Step 2: Verificar tsc**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add src/lib/next-safe-action.ts
git commit -m "feat(cadeado): client irmão billingGuardedClinicActionClient (não toca a base de leitura)"
```

---

## Task 4: Migrar as 12 actions criadoras puras para o client guardado

**Files (todas Modify, uma linha de import cada):**
- `src/actions/add-appointment/index.ts`
- `src/actions/create-appointment-procedure/index.ts`
- `src/actions/create-medical-record/index.ts`
- `src/actions/create-prescription/index.ts`
- `src/actions/create-optical-prescription/index.ts`
- `src/actions/create-certificate/index.ts`
- `src/actions/create-aesthetic-consent/index.ts`
- `src/actions/create-payment-transaction/index.ts`
- `src/actions/create-cash-movement/index.ts`
- `src/actions/create-attachment/index.ts`
- `src/actions/apply-bundle-to-appointment/index.ts`
- `src/actions/create-delivered-report-attachment/index.ts`

- [ ] **Step 1: Para CADA arquivo, trocar o client usado na definição da action.** O padrão em cada arquivo é uma chamada tipo `xxxActionClient.schema(...).action(...)` ou `.metadata(...).schema(...).action(...)`. Trocar SÓ o identificador do client (o primeiro da cadeia) para `billingGuardedClinicActionClient`, e garantir o import.

Exemplo (o real varia por arquivo — casar o client atual e trocar):
```
// antes:  export const createPrescription = doctorActionClient.schema(...)
// depois: export const createPrescription = billingGuardedClinicActionClient.schema(...)
```
Import a adicionar em cada arquivo:
```typescript
import { billingGuardedClinicActionClient } from "@/lib/next-safe-action";
```

⚠️ **Buckets exatos (verificados no código) — 5 + 7 = 12:**
- Usam `protectedWithClinicActionClient` hoje (→ trocar para `billingGuardedClinicActionClient`): **add-appointment, create-payment-transaction, create-cash-movement, create-attachment, create-delivered-report-attachment** (5). Deriva dele, então não perde nada; só adiciona o guard.
- Usam `doctorActionClient` hoje (→ trocar para `doctorBillingGuardedActionClient`, ver Step 2, para PRESERVAR o role): **create-appointment-procedure, create-medical-record, create-prescription, create-optical-prescription, create-certificate, create-aesthetic-consent, apply-bundle-to-appointment** (7).

- [ ] **Step 2: Preservar a checagem de ROLE das actions que eram doctor/admin.** `billingGuardedClinicActionClient` deriva da base de clínica, NÃO do `doctorActionClient` — então não tem a checagem "role === doctor/admin". Para as actions que usavam `doctorActionClient`, criar um client guardado que ALSO exige o role, para não afrouxar autorização:

Adicionar em `src/lib/next-safe-action.ts`:
```typescript
// Escrita de criação que exige role médico/admin (deriva do guard + role).
export const doctorBillingGuardedActionClient = billingGuardedClinicActionClient.use(
  async ({ next, ctx }) => {
    const role = ctx.user.clinic.role;
    if (role !== "admin" && role !== "doctor") {
      throw new Error("Acesso negado. Apenas médicos e administradores podem realizar esta ação.");
    }
    return next({ ctx });
  },
);
```
Usar `doctorBillingGuardedActionClient` nas 7 actions que eram `doctorActionClient`; usar `billingGuardedClinicActionClient` nas que eram `protectedWithClinicActionClient`.

- [ ] **Step 3: Verificar tsc**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Rodar os testes existentes dessas actions (se houver) — nenhum deve quebrar.**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run tests/ 2>&1 | tail -5`
Expected: sem novas falhas além das de integração sem TEST_DATABASE_URL (28P01), que são pré-existentes de ambiente.

- [ ] **Step 5: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add src/actions src/lib/next-safe-action.ts
git commit -m "feat(cadeado): guard nas 12 actions criadoras puras (preserva role doctor/admin)"
```

---

## Task 5: Guard inline nos 3 upserts clínicos (só criação — D6)

**Files (Modify):**
- `src/actions/upsert-medical-record/index.ts`
- `src/actions/upsert-aesthetic-record/index.ts`
- `src/actions/upsert-specialty-record-data/index.ts`

- [ ] **Step 1: Adicionar o guard DENTRO do handler, no caminho de CRIAÇÃO, antes do insert. O discriminador create-vs-update DIFERE por arquivo (verificado):**

Import comum:
```typescript
import { assertClinicWriteAllowed } from "@/lib/entitlement/assert-write-allowed";
```

**`upsert-medical-record`** — discrimina por `parsedInput.id` (linha 39: `if (parsedInput.id)` = edição). Guardar quando ausente:
```typescript
if (!parsedInput.id) {
  await assertClinicWriteAllowed(ctx.user.clinic.id); // criação de prontuário NOVO
}
```

**`upsert-aesthetic-record`** — NÃO tem `parsedInput.id`. Discrimina por lookup de `existing` (busca por appointmentId+clinicId, ~linha 66); criação é o ramo `!existing` (insert ~linha 111). Guardar imediatamente antes do `db.insert` do ramo de criação:
```typescript
if (!existing) {
  await assertClinicWriteAllowed(ctx.user.clinic.id); // antes do db.insert do ramo de criação
  // ... db.insert existente ...
}
```

**`upsert-specialty-record-data`** — também sem `parsedInput.id`. Discrimina por `existing` lookup (~linha 58); criação é `!existing` (insert ~linha 65). Mesmo padrão: guard antes do `db.insert` do ramo `!existing`.

⚠️ Ler cada arquivo e confirmar a linha exata do ramo de criação antes de inserir o guard — o ponto é: guard SÓ no caminho que cria linha nova, edição (existing/id presente) NUNCA guardada (D1/CFM).

- [ ] **Step 2: Verificar tsc + testes**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run tests/ 2>&1 | tail -4`
Expected: tsc 0; sem novas falhas de lógica.

- [ ] **Step 3: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add src/actions
git commit -m "feat(cadeado): guard inline nos upserts clínicos só na criação (id ausente) — D6"
```

---

## Task 6: `add-public-appointment` — guard inline + resposta uniforme (anti-oráculo)

**Files:**
- Modify: `src/actions/add-public-appointment/index.ts`
- Test: `tests/entitlement/public-appointment-uniform.test.ts`

- [ ] **Step 1: Escrever o teste falhando** — a resposta de bloqueio deve ser IDÊNTICA à de clínica inexistente/adimplente (não vaza status de assinatura).

```typescript
// tests/entitlement/public-appointment-uniform.test.ts
import { describe, it, expect } from "vitest";
import { publicBookingUnavailableMessage } from "@/actions/add-public-appointment/index";

describe("add-public-appointment — resposta uniforme (anti-oráculo)", () => {
  it("a mensagem de indisponibilidade não revela motivo/assinatura", () => {
    const msg = publicBookingUnavailableMessage();
    // Genérica: não menciona 'assinatura', 'pagamento', 'bloqueio', 'inadimpl'
    expect(msg).not.toMatch(/assinatura|pagamento|bloqueio|inadimpl|pendente/i);
    expect(msg.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar — Expected: FAIL** (função não exportada).

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run tests/entitlement/public-appointment-uniform.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** — exportar a mensagem uniforme e chamar o guard silenciosamente. Ler o arquivo primeiro (`src/actions/add-public-appointment/index.ts`) para achar o ponto após a validação da clínica (`onlineBookingEnabled`, ~linha 42).

```typescript
import { assertClinicWriteAllowed } from "@/lib/entitlement/assert-write-allowed";

/** Mensagem GENÉRICA de indisponibilidade — não revela por quê (anti-oráculo). */
export function publicBookingUnavailableMessage(): string {
  return "Agendamento online indisponível no momento. Entre em contato com a clínica.";
}

// dentro do handler, após validar a clínica e o doctor, ANTES do insert:
try {
  await assertClinicWriteAllowed(input.clinicId);
} catch {
  // Resposta UNIFORME: mesmo erro genérico que os outros caminhos de recusa.
  throw new Error(publicBookingUnavailableMessage());
}
```

⚠️ Como `add-public-appointment` é `export async function` (não next-safe-action), o guard é chamado direto. A mensagem uniforme deve casar o padrão de erro genérico que a action já usa nos outros caminhos de recusa — verificar como ela sinaliza "indisponível" hoje e alinhar (mesma forma de retorno/throw).

- [ ] **Step 4: Rodar — Expected: PASS.**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run tests/entitlement/public-appointment-uniform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add src/actions/add-public-appointment/index.ts tests/entitlement/public-appointment-uniform.test.ts
git commit -m "feat(cadeado): add-public-appointment guard inline + resposta uniforme (anti-oráculo)"
```

---

## Task 7: Receptor arma `denyVerifiedUntil` (D2/D3) + testes

**Files:**
- Modify: `src/lib/vis-entitlement-sync.ts` (`upsertMirror`)
- Test: `tests/entitlement/deny-verified-arming.test.ts`

- [ ] **Step 1: Escrever o teste falhando** — o valor de `denyVerifiedUntil` computado por um helper puro.

```typescript
// tests/entitlement/deny-verified-arming.test.ts
import { describe, it, expect } from "vitest";
import { computeDenyVerifiedUntil, DENY_TTL_MS } from "@/lib/vis-entitlement-sync";

describe("computeDenyVerifiedUntil (D2/D3)", () => {
  const syncedAt = new Date("2026-07-18T12:00:00.000Z");
  it("writeAllowed=false → syncedAt + 48h", () => {
    const r = computeDenyVerifiedUntil(false, syncedAt);
    expect(r?.getTime()).toBe(syncedAt.getTime() + DENY_TTL_MS);
  });
  it("writeAllowed=true → null (limpa o bloqueio)", () => {
    expect(computeDenyVerifiedUntil(true, syncedAt)).toBeNull();
  });
  it("TTL é 48h", () => {
    expect(DENY_TTL_MS).toBe(48 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Rodar — Expected: FAIL.**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run tests/entitlement/deny-verified-arming.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** — adicionar o helper e usá-lo no `upsertMirror`. Ler `src/lib/vis-entitlement-sync.ts` primeiro; o `values` e o `onConflictDoUpdate.set` estão em `upsertMirror` (~linha 172-218).

```typescript
/** TTL do bloqueio no espelho (D3). Cron diário renova; 48h = folga de ~1 dia. */
export const DENY_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Arma `denyVerifiedUntil` (D2): snapshot writeAllowed=false → syncedAt+TTL;
 * writeAllowed=true → null (limpa). Receber snapshot fresco É a verificação.
 */
export function computeDenyVerifiedUntil(writeAllowed: boolean, syncedAt: Date): Date | null {
  return writeAllowed ? null : new Date(syncedAt.getTime() + DENY_TTL_MS);
}
```

No `upsertMirror`, onde monta `values`, calcular `syncedAt` uma vez e derivar a coluna:
```typescript
const syncedAt = new Date();
const denyVerifiedUntil = computeDenyVerifiedUntil(snapshot.entitlement.writeAllowed, syncedAt);
```
Adicionar `syncedAt` (usar a mesma variável, não `new Date()` de novo) e `denyVerifiedUntil` tanto no objeto `values` quanto no `onConflictDoUpdate.set`. Verificar o nome da coluna no schema drizzle: `denyVerifiedUntil` (mapeada para `deny_verified_until`).

- [ ] **Step 4: Rodar — Expected: PASS (3 testes).**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run tests/entitlement/deny-verified-arming.test.ts`
Expected: PASS.

- [ ] **Step 5: Rodar os testes do sync existentes — não podem quebrar** (o upsert mudou).

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run tests/vis-entitlements/ 2>&1 | tail -4`
Expected: todos passam (15 testes: 9 em apply-entitlement-snapshot + 6 em sync-cron).

- [ ] **Step 6: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add src/lib/vis-entitlement-sync.ts tests/entitlement/deny-verified-arming.test.ts
git commit -m "feat(cadeado): receptor arma denyVerifiedUntil=syncedAt+48h (D2/D3)"
```

---

## Task 8: Teste de arquitetura (trava a fiação)

**Files:**
- Test: `tests/architecture/entitlement-guard-wiring.test.ts`

- [ ] **Step 1: Escrever o teste** — lê o código-fonte de cada action e afirma o client correto (padrão do teste `clientes-product-scope` do Vis: verificação estrutural por leitura de arquivo).

```typescript
// tests/architecture/entitlement-guard-wiring.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GUARDED_VIA_CLIENT,
  GUARDED_INLINE_UPSERT,
  GUARDED_INLINE_PUBLIC,
  PROTECTED_READS,
} from "@/lib/entitlement/guarded-actions";

const root = join(process.cwd(), "src/actions");
const read = (a: string) => readFileSync(join(root, a, "index.ts"), "utf8");

describe("cadeado — fiação do guard (anti-regressão)", () => {
  it("toda action criadora pura usa o client guardado", () => {
    for (const a of GUARDED_VIA_CLIENT) {
      const src = read(a);
      expect(
        src.includes("billingGuardedClinicActionClient") ||
          src.includes("doctorBillingGuardedActionClient"),
        `${a} deve usar um client guardado`,
      ).toBe(true);
    }
  });

  it("todo upsert clínico chama o guard inline", () => {
    for (const a of GUARDED_INLINE_UPSERT) {
      expect(read(a).includes("assertClinicWriteAllowed"), `${a} deve chamar o guard`).toBe(true);
    }
  });

  it("add-public-appointment chama o guard inline", () => {
    for (const a of GUARDED_INLINE_PUBLIC) {
      expect(read(a).includes("assertClinicWriteAllowed"), `${a} deve chamar o guard`).toBe(true);
    }
  });

  it("leituras de prontuário NUNCA usam o client guardado (CFM 1.821)", () => {
    for (const a of PROTECTED_READS) {
      const src = read(a);
      expect(src.includes("billingGuardedClinicActionClient"), `${a} é leitura — não pode ser guardada`).toBe(false);
      expect(src.includes("doctorBillingGuardedActionClient"), `${a} é leitura — não pode ser guardada`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Rodar — Expected: PASS** (após as Tasks 4-6 estarem feitas).

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run tests/architecture/entitlement-guard-wiring.test.ts`
Expected: PASS (4 blocos). Se algum falhar, a action correspondente não foi migrada — corrigir a action, não o teste.

- [ ] **Step 3: Confirmar os nomes de PROTECTED_READS existem como diretórios** (senão o `read()` lança).

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && for a in get-medical-record list-patient-records get-patient-timeline get-allowed-prescription-types; do ls src/actions/$a/index.ts >/dev/null 2>&1 && echo "$a OK" || echo "$a AUSENTE — ajustar a lista"; done`
Expected: todos OK. Se algum AUSENTE, achar o nome real da action de leitura equivalente e ajustar `PROTECTED_READS` em `guarded-actions.ts`.

- [ ] **Step 4: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add tests/architecture/entitlement-guard-wiring.test.ts
git commit -m "test(cadeado): teste de arquitetura trava a fiação do guard (CFM + cobertura)"
```

---

## Task 9: Seed sai do render de clinic-settings

**Files:**
- Modify: `src/app/(protected)/clinic-settings/page.tsx`
- Possível Create: `src/lib/ensure-clinic-procedures.ts` (se extrair)

- [ ] **Step 1: Ler `clinic-settings/page.tsx`** e localizar o seed de procedimentos/convênios que roda no render (usa `DEFAULT_PROCEDURES`, ~linha 41/171).

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && grep -n "DEFAULT_PROCEDURES\|insert\|seed" "src/app/(protected)/clinic-settings/page.tsx"`

- [ ] **Step 2: Mover a escrita para fora do caminho de render.** Opção mínima: envolver o seed com um guard de idempotência que só insere se ainda não existe E não escreve no render — ou movê-lo para um provisionamento chamado uma vez (ação/rota), não a cada render. Escolher a menor mudança que tire o `db.insert` do corpo do Server Component. Documentar no commit o que foi feito.

⚠️ NÃO aplicar o cadeado aqui (é setup/config, não criação faturável — fica EXEMPT). O objetivo desta task é só tirar a escrita do render (antipadrão + o Codex apontou que clínica bloqueada escreveria só abrindo a página).

- [ ] **Step 3: Verificar tsc + a página ainda renderiza (build parcial ou tsc).**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add "src/app/(protected)/clinic-settings/page.tsx" src/lib/ensure-clinic-procedures.ts
git commit -m "fix(cadeado): tira o seed de procedimentos do render (idempotente, fora do render)"
```

---

## Task 10: Documentar as envs (observação por padrão)

**Files:**
- Modify: `.env.example`
- Modify: `src/lib/env.ts` (se o Domus valida envs — opcional, `ENFORCE_VIS_ENTITLEMENTS` é opcional)

- [ ] **Step 1: Adicionar ao `.env.example`:**

```bash
# Cadeado (Sprint 2): bloqueio de escrita por inadimplência. Observação por
# padrão — só bloqueia de verdade com ENFORCE_VIS_ENTITLEMENTS=true. Vazio/qualquer
# outro valor = modo observação (loga WOULD_BLOCK, sempre libera).
ENFORCE_VIS_ENTITLEMENTS=
# CSV de clinicIds sempre liberados (destrava 1 clínica sem desligar tudo).
DOMUS_BILLING_BYPASS_CLINIC_IDS=
```

- [ ] **Step 2: Commit**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add .env.example
git commit -m "docs(cadeado): env ENFORCE_VIS_ENTITLEMENTS + bypass (observação por padrão)"
```

---

## Task 11: Verificação final (MANDATORY)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Suíte de testes completa**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && ./node_modules/.bin/vitest run 2>&1 | tail -8`
Expected: os testes novos do cadeado passam; as ÚNICAS falhas são integration sem `TEST_DATABASE_URL` (código `28P01`), pré-existentes de ambiente. Confirmar que NÃO há falha de asserção/lógica nova: `./node_modules/.bin/vitest run 2>&1 | grep -iE "AssertionError|expected .* to" | grep -v 28P01` deve sair vazio.

- [ ] **Step 3: Build de produção**

Run: `cd ~/SISTEMACLINICADOMUS-cadeado && npm run build 2>&1 | tail -15`
Expected: build success. Se colidir no lock do `.next` com outro build, `rm -rf .next` e repetir.

- [ ] **Step 4: Revisão final do Codex no diff completo** (alto risco).

Rodar o Codex (read-only) sobre o diff do branch `feature/cadeado-billing-guard` vs `main`: focar em (1) alguma leitura de prontuário guardada por engano; (2) role afrouxado nas actions que eram doctor/admin; (3) fail-open realmente cobre todo erro; (4) a resposta uniforme de add-public-appointment não vaza estado; (5) o arming do denyVerifiedUntil não regride o guard de fora-de-ordem do sync.

- [ ] **Step 5: Commit final (se houver ajustes da revisão) + resumo**

```bash
cd ~/SISTEMACLINICADOMUS-cadeado
git add -A && git commit -m "chore(cadeado): ajustes da revisão final"
git log --oneline main..HEAD
```

**Gate do Sprint 2 (v1 observação):** guard entregue em modo observação · leitura de prontuário jamais guardada (teste de arquitetura verde) · receptor arma denyVerifiedUntil · bypasses cobertos · zero falha de lógica na suíte · Codex revisou. **Ligar o enforce é decisão separada** (fase de medição, D5).

---
## ESTADO DE EXECUÇÃO (2026-07-18)
Tasks 1-10 ✅ implementadas (branch `feature/cadeado-billing-guard` no worktree `~/SISTEMACLINICADOMUS-cadeado`, 13 commits, tsc 0). **Task 11 (verificação final) BLOQUEOU o merge:** revisão final do Codex achou enumeração incompleta — ver memória `vis-medical-cadeado-sprint2.md` para a lista de actions faltantes (exams/*, procedure-reports/*, upsert-financial-transaction, open-cash-register), o cross-tenant de create-delivered-report-attachment, e o plano de retomada. NÃO mergear até fechar.
