# Agenda de Exame (ExamAppointment) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar um exame de vista para um lead numa data/hora move o card do funil para "Exame agendado" automaticamente (sem depender de venda), com reverse ao cancelar/faltar e uma agenda-do-dia para o atendente.

**Architecture:** Model novo `ExamAppointment` (enxuto, `timestamptz`). Um service `exam-appointment.service.ts` cria/atualiza o agendamento e move/reverte o card do lead na MESMA transação, espelhando o padrão de `linkLeadAndMaybeWinInTx`/`reverseLeadWinForSaleInTx`. Nova flag estável `EXAM_SCHEDULED` no estágio "Exame agendado" (o move referencia a flag, nunca o `name`). UI: botão "Agendar exame" no card do Kanban e no inbox; aba "Agenda" no funil (lista do dia, mobile-first).

**Tech Stack:** Next.js 16 (App Router), Prisma + Neon Postgres, TypeScript, Vitest, shadcn/ui, date-fns-tz.

**Environment notes:**
- Migração e deploy são **MANUAIS**. NÃO rodar `prisma migrate dev`/`migrate deploy` contra o `.env` (aponta pro Neon de PROD). A migração é escrita à mão e aplicada só no deploy supervisionado pelo orquestrador.
- `enum` novo (`ExamAppointmentStatus`): o `ALTER TYPE ... ADD VALUE` não roda na mesma tx em que o valor é usado — mas aqui o enum NASCE completo no `CREATE TYPE` da migração, então não há esse risco (é criação, não alteração).
- Guardrails para subagentes implementadores: PROIBIDO rodar `prisma format`/`prisma migrate`/`prisma generate`, trocar/criar/resetar branch, ou `git` além de `git add` dos arquivos da task + `git commit`. `prisma generate` (após editar schema) é rodado pelo ORQUESTRADOR entre tasks, não pelo subagente.
- Branch de trabalho: `feat/agenda-exame`. Há uma modificação NÃO-commitada pré-existente em `src/app/(auth)/login/page.tsx` de OUTRA sessão — NÃO tocar, NÃO commitar.
- Testes: `./node_modules/.bin/vitest run <file>`; tsc: `./node_modules/.bin/tsc --noEmit`; build: `npm run build`. O hook do RTK quebra `npx` → usar `./node_modules/.bin/`.

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `prisma/schema.prisma` (mod) | Model `ExamAppointment` + enum `ExamAppointmentStatus` + relações reversas em Lead/Customer/Branch/User/Company |
| `prisma/migrations/20260710120000_exam_appointment/migration.sql` (novo) | Migração aditiva hand-written (enum + tabela + FKs + 2 índices) |
| `src/lib/lead-stage-keys.ts` (mod) | Adiciona `EXAM_SCHEDULED` a `LEAD_STAGE_KEYS` |
| `src/services/lead-stage.service.ts` (mod) | Grava `systemKey=EXAM_SCHEDULED` no estágio "Exame agendado" do seed |
| `src/services/exam-appointment.service.ts` (novo) | Cérebro: cria/atualiza agendamento + move/reverte card na tx; lista do dia. IDOR-safe |
| `src/lib/validations/exam-appointment.schema.ts` (novo) | Zod schemas de POST/PATCH/GET |
| `src/app/api/exam-appointments/route.ts` (novo) | POST (criar) + GET (agenda do dia) |
| `src/app/api/exam-appointments/[id]/route.ts` (novo) | PATCH (status/remarcar) |
| `src/components/funil/agendar-exame-dialog.tsx` (novo) | Dialog "Agendar exame" (data/hora/responsável/obs) |
| `src/components/funil/agenda-exame.tsx` (novo) | Aba "Agenda": lista do dia + Compareceu/Faltou |
| `src/components/funil/lead-card.tsx` (mod) | Monta o botão "Agendar exame" |
| `src/components/funil/mover-coluna-inbox.tsx` (mod) | Monta o botão "Agendar exame" no inbox |
| `src/app/(dashboard)/dashboard/funil/page.tsx` (mod) | Aba "Agenda" (TabsTrigger + TabsContent) |

---

## Task 1: Schema + migração (model ExamAppointment)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260710120000_exam_appointment/migration.sql`

- [ ] **Step 1: Adicionar o model e o enum ao schema**

No `prisma/schema.prisma`, adicionar (perto dos outros models de funil/lead):

```prisma
enum ExamAppointmentStatus {
  SCHEDULED
  ATTENDED
  NO_SHOW
  CANCELLED
}

model ExamAppointment {
  id              String                @id @default(cuid())
  companyId       String
  leadId          String
  customerId      String?
  branchId        String?
  assignedUserId  String?
  scheduledAt     DateTime              @db.Timestamptz
  status          ExamAppointmentStatus @default(SCHEDULED)
  note            String?
  createdByUserId String
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  company      Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  lead         Lead      @relation("LeadExamAppointments", fields: [leadId], references: [id], onDelete: Cascade)
  customer     Customer? @relation("CustomerExamAppointments", fields: [customerId], references: [id], onDelete: SetNull)
  branch       Branch?   @relation(fields: [branchId], references: [id], onDelete: SetNull)
  assignedUser User?     @relation("AssignedExamAppointments", fields: [assignedUserId], references: [id], onDelete: SetNull)

  @@index([companyId, scheduledAt])
  @@index([companyId, leadId])
}
```

Adicionar as relações reversas (linha de campo, no local dos outros relations de cada model):
- Em `model Company { ... }`: `examAppointments ExamAppointment[]`
- Em `model Lead { ... }`: `examAppointments ExamAppointment[] @relation("LeadExamAppointments")`
- Em `model Customer { ... }`: `examAppointments ExamAppointment[] @relation("CustomerExamAppointments")`
- Em `model Branch { ... }`: `examAppointments ExamAppointment[]`
- Em `model User { ... }`: `assignedExamAppointments ExamAppointment[] @relation("AssignedExamAppointments")`

- [ ] **Step 2: Escrever a migração hand-written**

Criar `prisma/migrations/20260710120000_exam_appointment/migration.sql`:

```sql
-- Agenda de exame (ExamAppointment). Aditiva: enum novo NASCE completo (CREATE TYPE,
-- não ALTER — sem risco de "criar e usar na mesma tx"). Tabela + FKs + 2 índices.
CREATE TYPE "ExamAppointmentStatus" AS ENUM ('SCHEDULED', 'ATTENDED', 'NO_SHOW', 'CANCELLED');

CREATE TABLE "ExamAppointment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "customerId" TEXT,
    "branchId" TEXT,
    "assignedUserId" TEXT,
    "scheduledAt" TIMESTAMPTZ NOT NULL,
    "status" "ExamAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExamAppointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExamAppointment_companyId_scheduledAt_idx" ON "ExamAppointment"("companyId", "scheduledAt");
CREATE INDEX "ExamAppointment_companyId_leadId_idx" ON "ExamAppointment"("companyId", "leadId");

ALTER TABLE "ExamAppointment" ADD CONSTRAINT "ExamAppointment_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamAppointment" ADD CONSTRAINT "ExamAppointment_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamAppointment" ADD CONSTRAINT "ExamAppointment_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExamAppointment" ADD CONSTRAINT "ExamAppointment_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExamAppointment" ADD CONSTRAINT "ExamAppointment_assignedUserId_fkey"
    FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Orquestrador roda `prisma generate`**

(NÃO o subagente.) Run: `./node_modules/.bin/prisma generate`
Expected: "Generated Prisma Client" sem erro; `prisma.examAppointment` passa a existir no client.

- [ ] **Step 4: Verificar tsc**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros (o model compila; relações reversas resolvidas).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260710120000_exam_appointment/
git commit -m "feat(agenda-exame): model ExamAppointment + migração aditiva"
```

---

## Task 2: Flag EXAM_SCHEDULED (lead-stage-keys + seed)

**Files:**
- Modify: `src/lib/lead-stage-keys.ts`
- Modify: `src/services/lead-stage.service.ts:8`
- Test: `src/services/lead-stage.service.test.ts` (ou o existente que cobre o seed)

- [ ] **Step 1: Escrever o teste do seed idempotente**

Em `src/services/lead-stage.service.test.ts` (se não existir, criar), adicionar um teste que, após `ensureOpticalStages(companyId)`, o estágio de `name: "Exame agendado"` tem `systemKey === "EXAM_SCHEDULED"`, e rodar 2× não duplica. Espelhar o teste já existente do `EXAM_DONE` (procure por `EXAM_DONE` no arquivo de teste e copie a estrutura).

```typescript
it("marca 'Exame agendado' com systemKey EXAM_SCHEDULED (idempotente)", async () => {
  await ensureOpticalStages(companyId);
  await ensureOpticalStages(companyId); // 2ª vez não duplica
  const stages = await prisma.leadStage.findMany({ where: { companyId } });
  const agendado = stages.filter((s) => s.name === "Exame agendado");
  expect(agendado).toHaveLength(1);
  expect(agendado[0].systemKey).toBe("EXAM_SCHEDULED");
});
```

- [ ] **Step 2: Rodar o teste — deve FALHAR**

Run: `./node_modules/.bin/vitest run src/services/lead-stage.service.test.ts`
Expected: FAIL (systemKey vem null hoje).

- [ ] **Step 3: Adicionar a flag**

Em `src/lib/lead-stage-keys.ts`, dentro de `LEAD_STAGE_KEYS`:

```typescript
export const LEAD_STAGE_KEYS = {
  /** "Exame agendado": destino do agendamento de exame (ExamAppointment). */
  EXAM_SCHEDULED: "EXAM_SCHEDULED",
  /** "Exame feito": destino do sinal automático de venda só-de-exame. */
  EXAM_DONE: "EXAM_DONE",
} as const;
```

Em `src/services/lead-stage.service.ts:8`, trocar o `systemKey` da linha "Exame agendado":

```typescript
  { name: "Exame agendado", order: 2, isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED as string | null },
```

- [ ] **Step 4: Rodar o teste — deve PASSAR**

Run: `./node_modules/.bin/vitest run src/services/lead-stage.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-stage-keys.ts src/services/lead-stage.service.ts src/services/lead-stage.service.test.ts
git commit -m "feat(agenda-exame): flag estável EXAM_SCHEDULED no estágio Exame agendado"
```

---

## Task 3: Service — criar agendamento + mover card na tx

**Files:**
- Create: `src/services/exam-appointment.service.ts`
- Test: `src/services/exam-appointment.service.test.ts`

Contexto (padrões a espelhar): `linkLeadAndMaybeWinInTx` (`src/services/sale-side-effects.service.ts:702`) para o move, `moveLead` (`src/services/lead.service.ts:220`) para o guard IDOR. O move NÃO usa `moveLead` (que tem lógica de trava humana/AI) — faz o update direto na tx, como `linkLeadAndMaybeWinInTx`.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `src/services/exam-appointment.service.test.ts`, cobrir:
1. `createExamAppointment` com lead válido → cria o registro E move o card para o estágio `EXAM_SCHEDULED`.
2. herda `customerId`/`branchId` do lead (não do input).
3. lead de OUTRA empresa → lança `notFoundError` (IDOR), NÃO cria.
4. `assignedUserId` de outra empresa → lança `notFoundError`.
5. não move card que já está em `isWon`/`isLost`/`EXAM_DONE` (só-avança) — mas ainda cria o agendamento.
6. sem estágio `EXAM_SCHEDULED` na ótica → cria o agendamento, loga warn, não move (não inventa estágio).

```typescript
it("cria agendamento e move o card para EXAM_SCHEDULED", async () => {
  const appt = await createExamAppointment(
    { leadId, scheduledAt: new Date("2026-07-15T17:00:00Z"), assignedUserId: null, note: null },
    companyId,
    createdByUserId,
  );
  expect(appt.status).toBe("SCHEDULED");
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { stage: true } });
  expect(lead?.stage.systemKey).toBe("EXAM_SCHEDULED");
});

it("rejeita lead de outra empresa (IDOR)", async () => {
  await expect(
    createExamAppointment({ leadId: outroCompanyLeadId, scheduledAt: new Date(), assignedUserId: null, note: null }, companyId, createdByUserId),
  ).rejects.toThrow(/não encontrado/i);
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `./node_modules/.bin/vitest run src/services/exam-appointment.service.test.ts`
Expected: FAIL ("createExamAppointment is not a function").

- [ ] **Step 3: Implementar `createExamAppointment`**

```typescript
import { prisma } from "@/lib/prisma";
import { notFoundError } from "@/lib/errors"; // conferir o nome real do helper no projeto
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

const log = logger.child({ service: "exam-appointment" });

export interface CreateExamAppointmentInput {
  leadId: string;
  scheduledAt: Date;
  assignedUserId: string | null;
  note: string | null;
}

export async function createExamAppointment(
  input: CreateExamAppointmentInput,
  companyId: string,
  createdByUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    // IDOR-safe: lead tem que ser da empresa. Herda customerId/branchId do lead.
    const lead = await tx.lead.findFirst({
      where: { id: input.leadId, companyId, deletedAt: null },
      select: {
        id: true, customerId: true, branchId: true,
        stage: { select: { id: true, isWon: true, isLost: true, systemKey: true } },
      },
    });
    if (!lead) throw notFoundError("Lead não encontrado");

    // assignedUserId (se veio) tem que ser da empresa.
    if (input.assignedUserId) {
      const user = await tx.user.findFirst({
        where: { id: input.assignedUserId, companyId },
        select: { id: true },
      });
      if (!user) throw notFoundError("Responsável inválido");
    }

    const appt = await tx.examAppointment.create({
      data: {
        companyId,
        leadId: lead.id,
        customerId: lead.customerId,   // herdado do lead, nunca do input
        branchId: lead.branchId,       // herdado do lead
        assignedUserId: input.assignedUserId,
        scheduledAt: input.scheduledAt,
        note: input.note,
        createdByUserId,
      },
    });

    // Move card p/ EXAM_SCHEDULED — só-avança: nunca regride won/lost/EXAM_DONE.
    const terminalOrDone =
      lead.stage.isWon || lead.stage.isLost || lead.stage.systemKey === LEAD_STAGE_KEYS.EXAM_DONE;
    if (!terminalOrDone && lead.stage.systemKey !== LEAD_STAGE_KEYS.EXAM_SCHEDULED) {
      const target = await tx.leadStage.findFirst({
        where: { companyId, systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED },
        select: { id: true },
      });
      if (target) {
        await tx.lead.updateMany({
          where: { id: lead.id, companyId },
          data: { stageId: target.id, lastActivityAt: new Date() },
        });
      } else {
        log.warn("exam_no_scheduled_stage", { companyId, leadId: lead.id });
      }
    }
    return appt;
  });
}
```

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `./node_modules/.bin/vitest run src/services/exam-appointment.service.test.ts`
Expected: PASS (todos os casos de create).

- [ ] **Step 5: Commit**

```bash
git add src/services/exam-appointment.service.ts src/services/exam-appointment.service.test.ts
git commit -m "feat(agenda-exame): createExamAppointment move card p/ EXAM_SCHEDULED na tx (IDOR-safe)"
```

---

## Task 4: Service — mudar status (ATTENDED/NO_SHOW/CANCELLED) + reverse

**Files:**
- Modify: `src/services/exam-appointment.service.ts`
- Test: `src/services/exam-appointment.service.test.ts`

Contexto: o reverse espelha `reverseLeadWinForSaleInTx` (`src/services/sale-side-effects.service.ts:851`) — volta pro 1º estágio aberto (menor `order`), SÓ se o card ainda está em `EXAM_SCHEDULED`.

- [ ] **Step 1: Escrever os testes (falhando)**

1. `updateExamAppointmentStatus(id, "CANCELLED")` → status muda E, se card ainda em EXAM_SCHEDULED, volta pro 1º aberto.
2. `"NO_SHOW"` → idem reverse.
3. `"ATTENDED"` → status muda, card NÃO se move.
4. cancelar quando o card já foi movido por humano p/ outro estágio → status muda, card fica onde está (não reverte).
5. remarcar (`scheduledAt` novo) com status SCHEDULED → só muda a data, card não mexe.
6. agendamento de outra empresa → `notFoundError`.

```typescript
it("cancelar reverte o card p/ 1º aberto se ainda em EXAM_SCHEDULED", async () => {
  const appt = await createExamAppointment({ leadId, scheduledAt: new Date(), assignedUserId: null, note: null }, companyId, u);
  await updateExamAppointment(appt.id, { status: "CANCELLED" }, companyId);
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { stage: true } });
  expect(lead?.stage.order).toBe(0); // 1º aberto "Novo"
});

it("ATTENDED não move o card", async () => {
  const appt = await createExamAppointment({ leadId, scheduledAt: new Date(), assignedUserId: null, note: null }, companyId, u);
  await updateExamAppointment(appt.id, { status: "ATTENDED" }, companyId);
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { stage: true } });
  expect(lead?.stage.systemKey).toBe("EXAM_SCHEDULED"); // continua lá
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `./node_modules/.bin/vitest run src/services/exam-appointment.service.test.ts`
Expected: FAIL ("updateExamAppointment is not a function").

- [ ] **Step 3: Implementar `updateExamAppointment`**

```typescript
export interface UpdateExamAppointmentInput {
  status?: "SCHEDULED" | "ATTENDED" | "NO_SHOW" | "CANCELLED";
  scheduledAt?: Date;
}

export async function updateExamAppointment(
  id: string,
  input: UpdateExamAppointmentInput,
  companyId: string,
) {
  return prisma.$transaction(async (tx) => {
    const appt = await tx.examAppointment.findFirst({
      where: { id, companyId },
      select: { id: true, leadId: true, status: true },
    });
    if (!appt) throw notFoundError("Agendamento não encontrado");

    const updated = await tx.examAppointment.update({
      where: { id: appt.id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      },
    });

    // Reverse: cancelar/faltar → volta pro 1º aberto SÓ se card ainda em EXAM_SCHEDULED.
    // Espelha reverseLeadWinForSaleInTx. Remarcar (só scheduledAt) e ATTENDED não movem.
    const reverts = input.status === "CANCELLED" || input.status === "NO_SHOW";
    if (reverts) {
      const lead = await tx.lead.findFirst({
        where: { id: appt.leadId, companyId, deletedAt: null },
        select: { id: true, stage: { select: { systemKey: true } } },
      });
      if (lead?.stage.systemKey === LEAD_STAGE_KEYS.EXAM_SCHEDULED) {
        const firstOpen = await tx.leadStage.findFirst({
          where: { companyId, isWon: false, isLost: false },
          orderBy: { order: "asc" },
          select: { id: true },
        });
        if (firstOpen) {
          await tx.lead.updateMany({
            where: { id: lead.id, companyId },
            data: { stageId: firstOpen.id, lastActivityAt: new Date() },
          });
        }
      }
    }
    return updated;
  });
}
```

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `./node_modules/.bin/vitest run src/services/exam-appointment.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/exam-appointment.service.ts src/services/exam-appointment.service.test.ts
git commit -m "feat(agenda-exame): updateExamAppointment status + reverse espelhado (cancelar/faltar)"
```

---

## Task 5: Service — agenda do dia (listagem com fuso e escopo de filial)

**Files:**
- Modify: `src/services/exam-appointment.service.ts`
- Test: `src/services/exam-appointment.service.test.ts`

Contexto: janela do dia via `startOfLocalDay`/`endOfLocalDay` de `src/lib/date-utils.ts` (BRT), para não repetir o bug de fuso do MRR.

- [ ] **Step 1: Escrever os testes (falhando)**

1. `listExamAppointmentsForDay(date, companyId, branchId?)` retorna só os agendamentos daquele dia LOCAL (BRT), ordenados por `scheduledAt`.
2. um agendamento às 22h BRT (= 01h UTC do dia seguinte) aparece no dia BRT correto, não no seguinte.
3. filtra por `branchId` quando passado; sem `branchId`, retorna todos da empresa.
4. não vaza agendamento de outra empresa.

```typescript
it("agenda do dia agrupa por dia LOCAL (22h BRT não vaza p/ o dia seguinte)", async () => {
  // 2026-07-15 22:00 BRT === 2026-07-16 01:00 UTC
  await createExamAppointment({ leadId, scheduledAt: new Date("2026-07-16T01:00:00Z"), assignedUserId: null, note: null }, companyId, u);
  const doDia = await listExamAppointmentsForDay(new Date("2026-07-15T12:00:00Z"), companyId);
  expect(doDia).toHaveLength(1); // cai no dia 15 BRT
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `./node_modules/.bin/vitest run src/services/exam-appointment.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `listExamAppointmentsForDay`**

```typescript
import { startOfLocalDay, endOfLocalDay } from "@/lib/date-utils";

export async function listExamAppointmentsForDay(
  day: Date,
  companyId: string,
  branchId?: string | null,
) {
  const gte = startOfLocalDay(day);
  const lte = endOfLocalDay(day);
  return prisma.examAppointment.findMany({
    where: {
      companyId,
      scheduledAt: { gte, lte },
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true, scheduledAt: true, status: true, note: true,
      lead: { select: { id: true, name: true, phone: true } },
      assignedUser: { select: { id: true, name: true } },
    },
  });
}
```

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `./node_modules/.bin/vitest run src/services/exam-appointment.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/exam-appointment.service.ts src/services/exam-appointment.service.test.ts
git commit -m "feat(agenda-exame): listExamAppointmentsForDay (janela BRT + escopo filial)"
```

---

## Task 6: Zod schemas + rotas API

**Files:**
- Create: `src/lib/validations/exam-appointment.schema.ts`
- Create: `src/app/api/exam-appointments/route.ts`
- Create: `src/app/api/exam-appointments/[id]/route.ts`
- Test: `src/app/api/exam-appointments/route.test.ts`

Contexto: guards do padrão da casa — `requireAuth()`, `requirePermission("leads.edit")`, `getCompanyId()`, `getUserId()` de `@/lib/auth-helpers`; respostas via `@/lib/api-response` (`successResponse`/`createdResponse`); erros via `handleApiError` de `@/lib/error-handler`. Copiar o cabeçalho de `src/app/api/lead-stages/route.ts`.

- [ ] **Step 1: Escrever os schemas**

`src/lib/validations/exam-appointment.schema.ts`:

```typescript
import { z } from "zod";

export const createExamAppointmentSchema = z.object({
  leadId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  assignedUserId: z.string().min(1).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const updateExamAppointmentSchema = z
  .object({
    status: z.enum(["SCHEDULED", "ATTENDED", "NO_SHOW", "CANCELLED"]).optional(),
    scheduledAt: z.coerce.date().optional(),
  })
  .refine((d) => d.status !== undefined || d.scheduledAt !== undefined, {
    message: "Informe status ou nova data",
  });
```

- [ ] **Step 2: Escrever o teste de rota (falhando)**

`src/app/api/exam-appointments/route.test.ts` — mockar auth-helpers + service, e afirmar: POST sem auth → 401; POST sem `leads.edit` → 403; POST válido → 201 e chama `createExamAppointment` com `companyId`/`userId` da sessão (não do body). Espelhar o padrão de `src/app/api/lead-stages/route.test.ts`.

- [ ] **Step 3: Rodar — deve FALHAR**

Run: `./node_modules/.bin/vitest run src/app/api/exam-appointments/route.test.ts`
Expected: FAIL (rota não existe).

- [ ] **Step 4: Implementar as rotas**

`src/app/api/exam-appointments/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { requireAuth, requirePermission, getCompanyId, getUserId, getBranchId } from "@/lib/auth-helpers";
import { createdResponse, successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { createExamAppointment, listExamAppointmentsForDay } from "@/services/exam-appointment.service";
import { createExamAppointmentSchema } from "@/lib/validations/exam-appointment.schema";

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const body = createExamAppointmentSchema.parse(await req.json());
    const appt = await createExamAppointment(
      { leadId: body.leadId, scheduledAt: body.scheduledAt, assignedUserId: body.assignedUserId ?? null, note: body.note ?? null },
      companyId,
      userId,
    );
    return createdResponse(appt);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const day = dateParam ? new Date(dateParam) : new Date();
    // Escopo de filial: usa a filial da sessão; ADMIN/GERENTE podem passar ?branchId.
    const sessionBranch = await getBranchId().catch(() => null);
    const queryBranch = searchParams.get("branchId");
    const branchId = sessionBranch ?? queryBranch ?? null;
    const list = await listExamAppointmentsForDay(day, companyId, branchId);
    return successResponse(list);
  } catch (error) {
    return handleApiError(error);
  }
}
```

> **NOTA de escopo de filial:** confirmar como `getBranchId` se comporta para ADMIN (sem filial fixa). Se ADMIN retorna null, o `?branchId` do query vale; se um VENDEDOR tem filial fixa, ela prevalece sobre o query. Seguir exatamente o padrão de `funil-today-queue`/`lead.service.ts` (`branchId OR null`) — ler esse código antes de finalizar.

`src/app/api/exam-appointments/[id]/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { requireAuth, requirePermission, getCompanyId } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import { updateExamAppointment } from "@/services/exam-appointment.service";
import { updateExamAppointmentSchema } from "@/lib/validations/exam-appointment.schema";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const { id } = await params; // Next 16: params é Promise
    const body = updateExamAppointmentSchema.parse(await req.json());
    const updated = await updateExamAppointment(id, body, companyId);
    return successResponse(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 5: Rodar — deve PASSAR**

Run: `./node_modules/.bin/vitest run src/app/api/exam-appointments/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/exam-appointment.schema.ts src/app/api/exam-appointments/
git commit -m "feat(agenda-exame): rotas POST/GET/PATCH (guards leads.edit, companyId da sessão)"
```

---

## Task 7: UI — dialog "Agendar exame" + montagem no card e inbox

**Files:**
- Create: `src/components/funil/agendar-exame-dialog.tsx`
- Modify: `src/components/funil/lead-card.tsx`
- Modify: `src/components/funil/mover-coluna-inbox.tsx`
- Test: `src/components/funil/agendar-exame-dialog.test.tsx` (jsdom)

Contexto: usar componentes shadcn já no projeto (`Dialog`, `Button`, `Input type="datetime-local"`, `Textarea`, `Select`). Teste de componente usa pragma `/** @vitest-environment jsdom */` (o repo NÃO tem @testing-library/jest-dom → usar `.toBeDefined()`/queries do `@testing-library/react`).

- [ ] **Step 1: Teste do dialog (falhando)**

`/** @vitest-environment jsdom */` no topo. Renderizar `<AgendarExameDialog leadId="x" open onOpenChange={()=>{}} />`, afirmar que o campo de data e o botão "Agendar" existem; ao submeter, chama `fetch` para `POST /api/exam-appointments` com o `leadId`.

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `./node_modules/.bin/vitest run src/components/funil/agendar-exame-dialog.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 3: Implementar o dialog**

`agendar-exame-dialog.tsx`: dialog controlado (`open`/`onOpenChange`), props `leadId: string`, `users?: {id,name}[]` (opcional p/ o select de responsável), `onScheduled?: () => void`. Campo `datetime-local` obrigatório → converte para ISO no submit; `Textarea` para nota; `Select` opcional de responsável. Submit: `fetch("/api/exam-appointments", { method: "POST", body: JSON.stringify({ leadId, scheduledAt, assignedUserId, note }) })`; on success → `toast` + `onScheduled?.()` + fecha. Tratar erro com `toast` destrutivo.

> Fuso do input: `datetime-local` dá "2026-07-15T22:00" (hora local do navegador). Enviar como está e deixar o servidor interpretar em BRT, OU converter no cliente. Seguir o padrão existente do projeto para inputs de data local (ver como `novo-lead-modal.tsx` ou os campos de vencimento tratam) — NÃO inventar. Documentar a escolha no PR.

- [ ] **Step 4: Montar o botão no card e no inbox**

Em `src/components/funil/lead-card.tsx`: adicionar um item/botão "Agendar exame" que abre o dialog com o `leadId` do card (seguir como os outros botões do card são montados — provavelmente num menu de ações).

Em `src/components/funil/mover-coluna-inbox.tsx`: adicionar "Agendar exame" ao `DropdownMenu` existente (ao lado de "Mover para…").

- [ ] **Step 5: Rodar teste + tsc**

Run: `./node_modules/.bin/vitest run src/components/funil/agendar-exame-dialog.test.tsx && ./node_modules/.bin/tsc --noEmit`
Expected: PASS + 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/funil/agendar-exame-dialog.tsx src/components/funil/lead-card.tsx src/components/funil/mover-coluna-inbox.tsx src/components/funil/agendar-exame-dialog.test.tsx
git commit -m "feat(agenda-exame): dialog Agendar exame + botão no card e no inbox"
```

---

## Task 8: UI — aba "Agenda" (lista do dia + Compareceu/Faltou)

**Files:**
- Create: `src/components/funil/agenda-exame.tsx`
- Modify: `src/app/(dashboard)/dashboard/funil/page.tsx:571-590` (abas)
- Test: `src/components/funil/agenda-exame.test.tsx` (jsdom)

- [ ] **Step 1: Teste (falhando)**

Renderizar `<AgendaExame active branchId={null} />` com `fetch` mockado retornando 2 agendamentos; afirmar que ambos aparecem ordenados por hora e que há botões "Compareceu"/"Faltou"; clicar "Faltou" chama `PATCH /api/exam-appointments/<id>` com `{status:"NO_SHOW"}`.

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `./node_modules/.bin/vitest run src/components/funil/agenda-exame.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar a aba**

`agenda-exame.tsx`: props `active: boolean`, `branchId: string | null`. Ao ficar `active`, `fetch("/api/exam-appointments?date=<hoje ISO>&branchId=...")`. Lista vertical mobile-first: cada item mostra hora (formatada BRT via `formatInTimeZone`/util existente), nome do lead, telefone, e — se `status==="SCHEDULED"` — botões **Compareceu** (`PATCH {status:"ATTENDED"}`) e **Faltou** (`PATCH {status:"NO_SHOW"}`). Navegação ‹ hoje › muda a data. Estado vazio: "Nenhum exame para este dia." Skeleton no carregamento.

- [ ] **Step 4: Montar a aba no funil**

Em `src/app/(dashboard)/dashboard/funil/page.tsx`, dentro de `<TabsList>` (após "recuperar", linha ~576):

```tsx
<TabsTrigger value="agenda">Agenda</TabsTrigger>
```

E o `TabsContent` correspondente (após o de "recuperar"):

```tsx
<TabsContent value="agenda" className="mt-4">
  <AgendaExame active={activeTab === "agenda"} branchId={branchParam} />
</TabsContent>
```

Adicionar o import de `AgendaExame` no topo (junto dos outros imports de `@/components/funil/...`).

- [ ] **Step 5: Rodar teste + tsc**

Run: `./node_modules/.bin/vitest run src/components/funil/agenda-exame.test.tsx && ./node_modules/.bin/tsc --noEmit`
Expected: PASS + 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/funil/agenda-exame.tsx "src/app/(dashboard)/dashboard/funil/page.tsx" src/components/funil/agenda-exame.test.tsx
git commit -m "feat(agenda-exame): aba Agenda no funil (lista do dia + Compareceu/Faltou)"
```

---

## Task 9: Verificação final (MANDATÓRIA)

**Files:** nenhum novo (verificação).

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 2: Suíte de testes COMPLETA**

Run: `./node_modules/.bin/vitest run`
Expected: todos passam (baseline atual 2243 + os novos da agenda). Zero regressão no funil/venda (o move de venda `EXAM_DONE` intacto).

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: sucesso; rotas novas no manifest (`/api/exam-appointments`, `/api/exam-appointments/[id]`).

- [ ] **Step 4: Verificação de integração (leitura, não código)**

Confirmar manualmente na revisão:
- `createExamAppointment` e `updateExamAppointment` NUNCA aceitam `companyId`/`createdByUserId` do body.
- Toda FK do body (`leadId`, `assignedUserId`) revalidada por `{ id, companyId }`.
- `customerId`/`branchId` herdados do lead.
- Reverse só dispara em CANCELLED/NO_SHOW e só se card ainda em `EXAM_SCHEDULED`.
- `scheduledAt` é `TIMESTAMPTZ`; janela do dia via `startOfLocalDay/endOfLocalDay`.

- [ ] **Step 5: Commit final (se sobrou algo)**

```bash
git add -A && git commit -m "chore(agenda-exame): verificação final (tsc + suíte + build)" || echo "nada a commitar"
```

---

## Deploy (MANUAL — orquestrador/dono, pós-merge — NÃO é task de subagente)

1. Merge da branch `feat/agenda-exame` (PR).
2. **Migração manual em prod** ANTES do deploy: aplicar `20260710120000_exam_appointment/migration.sql` via `./node_modules/.bin/prisma migrate deploy` OU `prisma db execute --stdin` heredoc (o hook do RTK quebra `--file`) + registrar em `_prisma_migrations` se usar db execute. Enum nasce completo (CREATE TYPE) → sem o problema de "criar+usar na mesma tx".
3. `vercel deploy --prod --yes` (CLI no nvm).
4. Smoke: POST `/api/exam-appointments` sem auth → 401; abrir `/dashboard/funil` → aba "Agenda" aparece; marcar um exame de teste → card vai p/ "Exame agendado"; cancelar → volta p/ "Novo".
5. As colunas de ótica ganham `systemKey=EXAM_SCHEDULED` no 1º GET `/api/lead-stages` de cada ótica (best-effort, já existente).
