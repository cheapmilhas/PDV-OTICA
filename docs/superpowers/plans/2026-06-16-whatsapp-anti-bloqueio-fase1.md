# WhatsApp Anti-bloqueio (Fase 1) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o envio em rajada das automações de WhatsApp por uma fila processada aos poucos (1 msg/ótica/invocação, horário comercial, teto diário, lock atômico), mais um card de boas-práticas com aceite antes da conexão — para não bloquear o número.

**Architecture:** O cron diário deixa de enviar e passa a **enfileirar** (cria linhas `PENDING` em `WhatsappMessageLog`, reusando a tabela existente). Um endpoint novo `/api/cron/whatsapp-dispatch`, chamado por um acionador externo a cada ~3 min, faz **claim atômico** de 1 PENDING por ótica (`updateMany PENDING→PROCESSING`), reavalia elegibilidade, envia via Evolution e marca `SENT`/`FAILED`/`SKIPPED`. Sem sleep: o ritmo vem do intervalo do acionador. Migração 100% aditiva.

**Tech Stack:** Next.js 16 (App Router), Prisma + Postgres (Neon), Vitest, Evolution API. Spec: `docs/superpowers/specs/2026-06-15-whatsapp-anti-bloqueio-design.md`.

---

## Estrutura de arquivos

**Criar:**
- `src/lib/whatsapp-business-hours.ts` — helper de horário comercial + feriados nacionais fixos.
- `src/lib/__tests__/whatsapp-business-hours.test.ts`
- `src/services/whatsapp-queue-processor.ts` — processador da fila (claim + envio).
- `src/services/__tests__/whatsapp-queue-processor.test.ts`
- `src/app/api/cron/whatsapp-dispatch/route.ts` — endpoint do acionador.
- `src/app/api/whatsapp/accept-practices/route.ts` — grava o aceite do card.
- `prisma/migrations/<timestamp>_whatsapp_queue/migration.sql` — gerada pelo Prisma.

**Modificar:**
- `prisma/schema.prisma` — enum `WhatsappMessageStatus` += `PENDING`, `PROCESSING`; `CompanySettings` += `waPracticesAcceptedAt`.
- `src/lib/whatsapp-send.ts` — dedupe considera PENDING/PROCESSING/SENT; expor envio Evolution reutilizável.
- `src/services/whatsapp-automation.service.ts` — `dispatch` ganha modo `enqueue`.
- `src/app/api/cron/whatsapp-messages/route.ts` — roda em modo enqueue.
- `src/app/(dashboard)/dashboard/configuracoes/whatsapp/whatsapp-connect-client.tsx` — card + checkbox + grava aceite.
- `src/app/api/whatsapp/status/route.ts` — retornar `practicesAccepted` (p/ a UI saber se já aceitou).
- `vercel.json` — cron nativo 1×/dia de rede de segurança para o dispatch.

---

## Task 1: Migração aditiva (enum + coluna)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_whatsapp_queue/migration.sql` (gerada)

- [ ] **Step 1: Adicionar valores ao enum**

Em `prisma/schema.prisma`, no `enum WhatsappMessageStatus`:

```prisma
enum WhatsappMessageStatus {
  PENDING
  PROCESSING
  SENT
  FAILED
  SKIPPED
}
```

- [ ] **Step 2: Adicionar coluna do aceite**

No `model CompanySettings`, junto das colunas `wa*`:

```prisma
  waPracticesAcceptedAt DateTime?
```

- [ ] **Step 3: Gerar a migração SEM aplicar em produção**

Run: `npx prisma migrate dev --name whatsapp_queue --create-only`
Expected: cria a pasta de migração com o SQL aditivo (ALTER TYPE ... ADD VALUE + ALTER TABLE ... ADD COLUMN). NÃO aplicar em prod aqui — só gerar.

> ⚠️ `ALTER TYPE ... ADD VALUE` no Postgres não roda dentro de transação com outros statements em algumas versões. Conferir o SQL gerado; se necessário, separar o ADD VALUE do enum num arquivo de migração próprio. O dono aplica via checklist (`prisma migrate deploy`) com backup.

- [ ] **Step 4: Regenerar o Prisma Client e checar tipos**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: 0 erros; `PENDING`/`PROCESSING` disponíveis no tipo.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(whatsapp): migração aditiva fila (PENDING/PROCESSING + waPracticesAcceptedAt)"
```

---

## Task 2: Helper de horário comercial + feriados

**Files:**
- Create: `src/lib/whatsapp-business-hours.ts`
- Test: `src/lib/__tests__/whatsapp-business-hours.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
import { describe, it, expect } from "vitest";
import { isWithinBusinessHours } from "@/lib/whatsapp-business-hours";

// Datas em UTC; 8h-18h BRT = 11h-21h UTC.
describe("isWithinBusinessHours", () => {
  it("dentro da janela (10h BRT seg) → true", () => {
    expect(isWithinBusinessHours(new Date("2026-06-15T13:00:00Z"))).toBe(true); // seg 10h BRT
  });
  it("antes das 8h BRT → false", () => {
    expect(isWithinBusinessHours(new Date("2026-06-15T10:59:00Z"))).toBe(false); // 7h59 BRT
  });
  it("depois das 18h BRT → false", () => {
    expect(isWithinBusinessHours(new Date("2026-06-15T21:01:00Z"))).toBe(false); // 18h01 BRT
  });
  it("domingo → false", () => {
    expect(isWithinBusinessHours(new Date("2026-06-14T13:00:00Z"))).toBe(false); // dom 10h BRT
  });
  it("feriado nacional fixo (25/12) → false", () => {
    expect(isWithinBusinessHours(new Date("2026-12-25T13:00:00Z"))).toBe(false);
  });
});

import { spDayRange } from "@/lib/whatsapp-business-hours";

describe("spDayRange (dia civil em BRT, UTC-3)", () => {
  it("um instante às 10h BRT → janela 03:00Z do mesmo dia a 03:00Z do dia seguinte", () => {
    const { start, end } = spDayRange(new Date("2026-06-15T13:00:00Z")); // seg 10h BRT
    expect(start.toISOString()).toBe("2026-06-15T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-16T03:00:00.000Z");
  });
  it("23h BRT (já 02h UTC do dia seguinte) ainda cai no dia civil BRT correto", () => {
    // 2026-06-15 23:00 BRT = 2026-06-16 02:00 UTC → dia civil BRT = 15/06
    const { start } = spDayRange(new Date("2026-06-16T02:00:00Z"));
    expect(start.toISOString()).toBe("2026-06-15T03:00:00.000Z");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/__tests__/whatsapp-business-hours.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o helper**

```typescript
/**
 * Horário comercial p/ envio de WhatsApp (anti-bloqueio): 8h–18h em
 * America/Sao_Paulo, pula domingo e feriados nacionais de DATA FIXA.
 * Feriados móveis (Carnaval etc.) ficam para a Fase 2.
 */

const OPEN_HOUR = 8;
const CLOSE_HOUR = 18; // exclusivo: vale até 17:59

/** Feriados nacionais de data fixa (MM-DD). */
const FIXED_HOLIDAYS = new Set([
  "01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25",
]);

/** Partes de data/hora em America/Sao_Paulo. */
function partsInSP(d: Date): { weekday: number; hour: number; mmdd: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short", hour: "2-digit", hour12: false,
    month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[parts.weekday as string] ?? 0,
    hour: Number(parts.hour),
    mmdd: `${parts.month}-${parts.day}`,
  };
}

export function isWithinBusinessHours(now: Date = new Date()): boolean {
  const { weekday, hour, mmdd } = partsInSP(now);
  if (weekday === 0) return false;          // domingo
  if (FIXED_HOLIDAYS.has(mmdd)) return false;
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

/** Início e fim do dia civil em America/Sao_Paulo, em UTC (p/ contar o teto). */
export function spDayRange(now: Date = new Date()): { start: Date; end: Date } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const ymd = fmt.format(now); // "yyyy-MM-dd"
  // BRT = UTC-3 (sem horário de verão desde 2019). Dia 00:00 BRT = 03:00 UTC.
  const start = new Date(`${ymd}T03:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
```

> Nota: BRT é UTC-3 fixo (Brasil aboliu horário de verão em 2019). Se isso mudar, revisar `spDayRange`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/__tests__/whatsapp-business-hours.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp-business-hours.ts src/lib/__tests__/whatsapp-business-hours.test.ts
git commit -m "feat(whatsapp): helper de horário comercial + feriados fixos"
```

---

## Task 3: Dedupe considera PENDING/PROCESSING/SENT

**Files:**
- Modify: `src/lib/whatsapp-send.ts` (a query de dedupe em `checkWhatsappEligibility`)
- Test: `src/lib/__tests__/whatsapp-send.test.ts`

> ⚠️ **PRÉ-REQUISITO DE CORRETUDE (CRÍTICO — não pular):** o `@@unique([companyId,
> type,referenceId,periodKey])` **NÃO** protege contra PENDING duplicado quando
> `periodKey` é `null` — no Postgres, `NULL` é distinto em índice único, então duas
> linhas com periodKey null NÃO colidem (P2002 nunca dispara). Além disso, o
> `checkWhatsappEligibility` **só roda o dedupe quando `periodKey` existe**
> (`if (periodKey)` em whatsapp-send.ts). Logo, a proteção da fila contra
> duplicata **depende de as automações SEMPRE passarem `periodKey`**. Confirmado
> hoje: os 4 `runXxx` passam `periodKey: dayKey(...)` ou `dayKey(dueDate)` — nunca
> null. **Regra a manter:** qualquer envio enfileirável DEVE ter `periodKey`. Não
> afirmar que "o unique impede a 2ª linha" como garantia geral — só vale com
> periodKey presente.

- [ ] **Step 1: Ajustar o teste de dedupe existente + adicionar casos**

No arquivo de teste, com `periodKey` presente:
- uma linha `PENDING` da mesma chave → `checkWhatsappEligibility` retorna
  `eligible:false, skipReason:"already_sent"`.
- idem para `PROCESSING`.
(Espelhar o teste que hoje usa `SENT`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/__tests__/whatsapp-send.test.ts`
Expected: FAIL nos casos novos (hoje só filtra `SENT`).

- [ ] **Step 3: Implementar**

Em `src/lib/whatsapp-send.ts`, na checagem 5 (dedupe), trocar `status: "SENT"` por um `in`. **Manter o guard `if (periodKey)` existente** (não removê-lo):

```typescript
    const dup = await prisma.whatsappMessageLog.findFirst({
      where: { companyId, type, referenceId, periodKey, status: { in: ["PENDING", "PROCESSING", "SENT"] } },
      select: { id: true },
    });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/__tests__/whatsapp-send.test.ts`
Expected: PASS (todos, incluindo os novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp-send.ts src/lib/__tests__/whatsapp-send.test.ts
git commit -m "feat(whatsapp): dedupe considera PENDING/PROCESSING/SENT (fila)"
```

---

## Task 4: Expor o envio Evolution reutilizável

**Files:**
- Modify: `src/lib/whatsapp-send.ts`
- Test: `src/lib/__tests__/whatsapp-send.test.ts`

Objetivo: o processador precisa enviar via Evolution e gravar `SENT`/`FAILED` numa linha que JÁ existe (não criar nova). Hoje `sendWhatsappMessage` cria a linha. Extrair a parte "enviar + atualizar a linha existente".

- [ ] **Step 1: Escrever teste de `sendExistingQueued`**

Teste: dada uma linha PROCESSING (id, phone normalizado, content), `sendExistingQueued` chama `evolution.sendText` e atualiza a linha para `SENT` com `sentAt`/`evolutionMessageId`; em erro, atualiza para `FAILED` com `error`. Nunca lança.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/__tests__/whatsapp-send.test.ts`
Expected: FAIL (função não existe).

- [ ] **Step 3: Implementar `sendExistingQueued`**

```typescript
/**
 * Envia uma mensagem JÁ enfileirada (linha existente em PROCESSING) via Evolution
 * e atualiza a própria linha para SENT/FAILED. Usado pelo processador da fila.
 * Não cria linha nova. Nunca lança.
 */
export async function sendExistingQueued(args: {
  logId: string;
  companyId: string;
  number: string;   // já normalizado
  content: string;
}): Promise<"SENT" | "FAILED"> {
  const { logId, companyId, number, content } = args;
  try {
    const instanceName = instanceNameForCompany(companyId);
    const res = await evolution.sendText(instanceName, number, content);
    await prisma.whatsappMessageLog.update({
      where: { id: logId },
      data: { status: "SENT", sentAt: new Date(), evolutionMessageId: res.key?.id ?? null },
    });
    return "SENT";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Falha ao enviar WhatsApp enfileirado", { companyId, logId, error: errMsg });
    await prisma.whatsappMessageLog.update({
      where: { id: logId },
      data: { status: "FAILED", error: errMsg },
    }).catch(() => {});
    return "FAILED";
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/__tests__/whatsapp-send.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp-send.ts src/lib/__tests__/whatsapp-send.test.ts
git commit -m "feat(whatsapp): sendExistingQueued (envia linha enfileirada existente)"
```

---

## Task 5: Modo enqueue no motor

**Files:**
- Modify: `src/services/whatsapp-automation.service.ts`
- Test: `src/services/__tests__/whatsapp-automation.service.test.ts`

Objetivo: `dispatch` ganha um modo `enqueue`. Hoje ele tem `dryRun` (simula) e normal (envia). O modo enqueue cria a linha `PENDING` (sem enviar), respeitando o dedupe. A varredura (`runWhatsappAutomations`) ganha `options.enqueue`.

> ⚠️ **Trabalho de propagação (não subestimar):** `dispatch` hoje é **posicional**:
> `dispatch(input, customerName, result, dryRun)`. Adicionar `enqueue` exige tocar
> **5 lugares** e a compilação só fecha quando TODOS forem feitos:
> 1. assinatura de `dispatch` → `dispatch(input, customerName, result, dryRun, enqueue)`;
> 2-5. as 4 chamadas de `dispatch` dentro de `runOsReady`, `runInstallmentDue`,
>    `runPostSale`, `runBirthday` (passar `enqueue` ao final);
> 6. a assinatura dos 4 `runXxx` (recebem `enqueue: boolean`) e suas chamadas em
>    `runWhatsappAutomations` (que lê `options.enqueue`).
> Espelha exatamente o que já foi feito p/ `dryRun` — seguir o mesmo padrão.

- [ ] **Step 1: Escrever teste**

`runWhatsappAutomations(now, { enqueue: true })` com OS_READY ligado: NÃO chama `sendWhatsappMessage`; chama `prisma.whatsappMessageLog.create` com `status:"PENDING"`; se `checkWhatsappEligibility` retornar inelegível, NÃO cria. Mockar `prisma.whatsappMessageLog.create` e `checkElig`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/__tests__/whatsapp-automation.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

No `dispatch`, adicionar o ramo enqueue (antes do envio normal). Propagar `enqueue` pelos 5 lugares acima. No enqueue: primeiro `checkWhatsappEligibility`; se elegível, `create` com try/catch que **só engole P2002** (corrida de duplicata) e **re-lança/loga o resto** — não silenciar erros de banco legítimos (seguir o padrão de `persistSkip`, que loga). Não fazer `tally`.

```typescript
import { Prisma } from "@prisma/client";

// dentro de dispatch, antes do envio normal:
if (enqueue) {
  const elig = await checkWhatsappEligibility(input);
  if (!elig.eligible) return;
  try {
    await prisma.whatsappMessageLog.create({
      data: {
        companyId: input.companyId,
        customerId: input.customer.id ?? null,
        type: input.type,
        phone: elig.number ?? input.customer.phone ?? "",
        content: elig.content,
        status: "PENDING",
        referenceId: input.referenceId ?? null,
        periodKey: input.periodKey ?? null,
      },
    });
  } catch (e) {
    // P2002 = já enfileirado/enviado (corrida) → idempotente, ignora.
    // Qualquer outro erro é real: loga (não silencia).
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      log.error("Falha ao enfileirar WhatsApp", {
        companyId: input.companyId, type: input.type,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/services/__tests__/whatsapp-automation.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/whatsapp-automation.service.ts src/services/__tests__/whatsapp-automation.service.test.ts
git commit -m "feat(whatsapp): modo enqueue no motor (cria PENDING sem enviar)"
```

---

## Task 6: Cron diário passa a enfileirar

**Files:**
- Modify: `src/app/api/cron/whatsapp-messages/route.ts`

- [ ] **Step 1: Trocar a chamada para modo enqueue**

```typescript
const result = await runWhatsappAutomations(new Date(), { enqueue: true });
```

(O `/api/cron/whatsapp-messages` deixa de enviar; só enfileira.)

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/whatsapp-messages/route.ts
git commit -m "feat(whatsapp): cron diário enfileira (não envia direto)"
```

---

## Task 7: Processador da fila (claim atômico + envio)

**Files:**
- Create: `src/services/whatsapp-queue-processor.ts`
- Test: `src/services/__tests__/whatsapp-queue-processor.test.ts`

Objetivo: a função central, chamada pelo endpoint. 1 msg/ótica/invocação, sem sleep.

**Assinatura (já prevendo o uso da Task 9):**
```typescript
export async function processWhatsappQueue(
  now: Date = new Date(),
  options?: { companyId?: string },  // quando setado, processa só essa ótica (run-now)
): Promise<QueueResult>
```

Pseudo-fluxo:
```
processWhatsappQueue(now, options):
  if (!isWithinBusinessHours(now)) return { skippedOutOfHours: true, ...zeros }
  recuperarProcessingPreso(now)   // PROCESSING > STALE_MIN → PENDING
  óticas = distinct companyId de WhatsappMessageLog status=PENDING, conectadas
           (se options.companyId, filtra só essa)
  for cada ótica:
    if contagem(status=SENT, sentAt ∈ spDayRange(now)) >= TETO: continue
    // CLAIM ATÔMICO: trava 1 PENDING mais antiga dessa ótica.
    // Padrão de 2 passos com guarda de status (mock não prova atomicidade real —
    // a garantia vem do WHERE status=PENDING no updateMany do Postgres):
    alvo = findFirst({ where:{companyId, status:"PENDING"}, orderBy:{createdAt:"asc"} })
    if (!alvo) continue
    claim = updateMany({ where:{ id: alvo.id, status:"PENDING" }, data:{ status:"PROCESSING" } })
    if (claim.count === 0) continue   // outra invocação pegou antes
    linha = findUnique(alvo.id)        // relê phone/content/customer da linha travada
    elig = checkWhatsappEligibility(de linha)   // reavalia (opt-out etc.)
    if (!elig.eligible) update(alvo.id → SKIPPED, skipReason); skipped++; continue
    r = sendExistingQueued({ logId, companyId, number: elig.number, content: elig.content })
    r==="SENT" ? sent++ : failed++
  pendingRestantes = count(status="PENDING" [, companyId])
  return { sent, skipped, failed, claimed, pendingRestantes, skippedOutOfHours:false }
```

> **Atomicidade (honestidade do teste):** o claim de 2 passos com `updateMany ...
> WHERE status="PENDING"` é atômico **no Postgres**. Os testes desta task são
> **mockados** — eles provam que o `where.status="PENDING"` é passado e que
> `count===0` aborta o envio, mas **não provam atomicidade sob concorrência real**
> (isso depende do banco). Isso é aceitável p/ Fase 1; a garantia anti-duplo está
> no WHERE com guarda de status, não no mock.

- [ ] **Step 1: Escrever testes** (mockando prisma/checkElig/sendExistingQueued/isWithinBusinessHours)

Casos:
- fora do horário → retorna `skippedOutOfHours:true`, nenhum claim.
- teto atingido → pula a ótica (não faz claim).
- claim atômico: `updateMany` chamado com `where.status="PENDING"`; se count=0, não envia.
- reavalia: inelegível → marca `SKIPPED`, não chama `sendExistingQueued`, `skipped` incrementa.
- elegível → chama `sendExistingQueued` 1×; `sent` incrementa em "SENT", `failed` em "FAILED".
- PROCESSING preso > STALE_MIN → volta a PENDING (updateMany chamado no início).
- **métrica `pendingRestantes`:** após processar, o retorno traz a contagem de
  PENDING restantes (mockar o count final) — é o sinal de fila represada (M2).
- **`options.companyId`:** quando setado, a query de óticas filtra só essa (usado
  pela Task 9).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/__tests__/whatsapp-queue-processor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `processWhatsappQueue`** (usar `isWithinBusinessHours`, `spDayRange`, `checkWhatsappEligibility`, `sendExistingQueued`). TETO=50, STALE_MIN=10 como const no topo.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/services/__tests__/whatsapp-queue-processor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/whatsapp-queue-processor.ts src/services/__tests__/whatsapp-queue-processor.test.ts
git commit -m "feat(whatsapp): processador da fila (claim atômico + 1 msg/ótica, sem sleep)"
```

---

## Task 8: Endpoint do acionador + cron de segurança

**Files:**
- Create: `src/app/api/cron/whatsapp-dispatch/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Criar a rota** (espelhar `whatsapp-retention/route.ts`: `Bearer CRON_SECRET` → 401; chama `processWhatsappQueue()`; loga métricas; retorna `{ok:true,...}`).

- [ ] **Step 2: Adicionar cron nativo 1×/dia (rede de segurança)** em `vercel.json`:

```json
{ "path": "/api/cron/whatsapp-dispatch", "schedule": "0 12 * * *" }
```

> ⚠️ Será o **12º cron** (hoje há 11). Se a Vercel bloquear no deploy por limite do
> Hobby, **PLANO-B (sem novo cron):** NÃO adicionar esta entrada; em vez disso, o
> cron diário existente `/api/cron/whatsapp-messages` (Task 6), após enfileirar,
> chama `processWhatsappQueue()` uma vez no fim — drena a 1ª leva como rede de
> segurança. O acionador externo continua sendo o processador principal. Assim não
> aumenta a contagem de crons. Decidir no deploy; se couber o 12º, manter a entrada
> dedicada (mais limpo).

- [ ] **Step 3: Checar tipos + smoke local**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/whatsapp-dispatch/route.ts vercel.json
git commit -m "feat(whatsapp): endpoint do acionador da fila + cron de segurança"
```

---

## Task 9: Botão "Processar agora" enfileira + dispara 1ª leva

**Files:**
- Modify: `src/app/api/whatsapp/run-now/route.ts`

- [ ] **Step 1: Trocar o run-now para enfileirar + processar**

```typescript
await runWhatsappAutomations(new Date(), { companyId, enqueue: true });
const result = await processWhatsappQueue(new Date(), { companyId });
```

(Enfileira tudo da ótica e já solta a 1ª leva respeitando horário/teto/lock. `processWhatsappQueue` ganha `options.companyId` opcional — só processa aquela ótica.)

- [ ] **Step 2: Atualizar o teste do run-now** (se houver) e tsc.

Run: `npx tsc --noEmit && npx vitest run src/services/__tests__/whatsapp-queue-processor.test.ts`
Expected: 0 erros, PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/whatsapp/run-now/route.ts src/services/whatsapp-queue-processor.ts
git commit -m "feat(whatsapp): Processar agora enfileira + dispara 1ª leva da ótica"
```

---

## Task 10: Card de boas-práticas + checkbox + aceite

**Files:**
- Create: `src/app/api/whatsapp/accept-practices/route.ts`
- Modify: `src/app/api/whatsapp/status/route.ts` (retornar `practicesAccepted`)
- Modify: `src/app/(dashboard)/dashboard/configuracoes/whatsapp/whatsapp-connect-client.tsx`

- [ ] **Step 1: Endpoint `POST /api/whatsapp/accept-practices`** — `getCompanyId()` da sessão + `requirePermission("settings.edit")` + flag; `prisma.companySettings.upsert` setando `waPracticesAcceptedAt: new Date()`. Retorna `{success:true}`.

- [ ] **Step 2: `status/route.ts`** passa a retornar `practicesAccepted: Boolean(settings?.waPracticesAcceptedAt)`.

- [ ] **Step 3: UI** — no `whatsapp-connect-client.tsx`, quando NÃO conectado E `!practicesAccepted`: renderizar o card de boas-práticas com checkbox "Li e entendo"; o botão de conectar/gerar QR fica `disabled` até marcar. Ao marcar e prosseguir, chamar `accept-practices` (otimista) e liberar o fluxo. Uma vez aceito, não mostra mais.

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/whatsapp/accept-practices/route.ts src/app/api/whatsapp/status/route.ts "src/app/(dashboard)/dashboard/configuracoes/whatsapp/whatsapp-connect-client.tsx"
git commit -m "feat(whatsapp): card de boas-práticas + aceite antes de conectar"
```

---

## Task 11: Validação final + documento do acionador externo

**Files:**
- Create: `docs/whatsapp-acionador-externo.md` (passo a passo p/ o dono configurar cron-job.org)

- [ ] **Step 1: Suíte completa**

Run: `npx vitest run`
Expected: PASS (todos; ~+15 testes novos).

- [ ] **Step 2: tsc + build**

Run: `npx tsc --noEmit && rtk proxy npx next build`
Expected: 0 erros; rotas `whatsapp-dispatch` e `accept-practices` no manifest.

- [ ] **Step 3: Escrever `docs/whatsapp-acionador-externo.md`** — passo a passo cron-job.org (URL `https://vis.app.br/api/cron/whatsapp-dispatch`, header `Authorization: Bearer <CRON_SECRET>`, intervalo 3 min) + o que fazer se a fila crescer.

- [ ] **Step 4: Commit**

```bash
git add docs/whatsapp-acionador-externo.md
git commit -m "docs(whatsapp): guia do acionador externo da fila"
```

---

## Checklist de DEPLOY (executado pelo DONO, não pelo Cursor)

1. **Backup:** tag git `backup/main-antes-anti-bloqueio-<data>` + snapshot Neon (TEM migração).
2. **Migração:** `prisma migrate deploy` (aplica o enum + coluna aditivos). Conferir `ALTER TYPE ADD VALUE`.
3. **Deploy:** `vercel deploy --prod` via CLI (push não promove alias confiável neste projeto).
4. **Confirmar rotas no build:** `vercel inspect vis.app.br --logs | grep -E "whatsapp-dispatch|accept-practices"`.
5. **Acionador externo:** configurar cron-job.org conforme `docs/whatsapp-acionador-externo.md`.
6. **Smoke:** dispatch 401 sem auth; ligar 1 automação; observar a fila drenar aos poucos no Histórico.

## Riscos / dívidas conhecidas
- **Reenvio residual** se a função morrer após o `evolution.sendText` mas antes de gravar SENT (a recuperação de PROCESSING devolve a PENDING). Mitigado pela janela de dedupe; risco baixo, documentado.
- **12º cron no Hobby** pode bater no limite — Task 8 manda PARAR e reportar se a Vercel bloquear.
- **Feriados móveis** não cobertos (Fase 2).
