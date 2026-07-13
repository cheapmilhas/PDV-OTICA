# Vis Medical — Núcleo Clínico Fatia 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o fluxo clínico vertical fino do Vis Medical — recepção agenda + check-in → médico atende (prontuário BR) → registra refração → clica "gerar receita" → emite — numa conta VIS_MEDICAL, com gate de produto/consentimento e acesso logado, sem regressão no Vis App.

**Architecture:** 3 tabelas novas (`ClinicalAppointment`, `Encounter`, `RefractionExam`) + campo `Prescription.refractionExamId`. Rotas de API seguem o padrão do projeto (requireAuth→requirePermission→getCompanyId→zod→service→handleApiError). "Gerar receita" REUSA `upsertPrescription` (livro-receitas.service). Grade de refração REUSA `DiopterKeypad`/`DecimalInput` da Fase A. Gate clínico = permissão granular + validação `Company.platformProduct===VIS_MEDICAL` (a sessão não carrega o campo → query). Imutabilidade pós-SIGNED = guard de service. Auto-save = localStorage (não servidor).

**Tech Stack:** Next.js 16 App Router, Prisma+Postgres/Neon, TypeScript, Vitest, Shadcn/Tailwind.

**Environment notes:**
- SEM Neon dev isolado → toda migração é `.sql` hand-written + `./node_modules/.bin/prisma migrate deploy`. NUNCA `migrate dev`.
- Use `node ./node_modules/prisma/build/index.js` ou `./node_modules/.bin/prisma` — o rtk hook quebra `npx`/`prisma` direto. Env: `set -a; source .env; set +a` (NÃO grep no .env — vaza credencial).
- Husky pre-commit roda `tsc` no projeto todo (lento) → rodar `tsc --noEmit` manual e commitar com `--no-verify`.
- Trabalhar em worktree isolado (branch `feat/vis-medical-clinico-f1`).
- **NÃO aplicar migração em prod nem deployar sem OK explícito do dono.**
- Enum novo = `CREATE TYPE` direto (via `DO $$ IF NOT EXISTS` idempotente). `ADD VALUE` a enum existente = top-level, nunca em `DO $$`.
- RBAC runtime = `catalog.ts` (roles PT) + banco. NÃO o `ROLE_PERMISSIONS` de `permissions.ts` (EN, legado/estático).

---

## File Structure

**Schema & migração (Task 1):**
- Modify: `prisma/schema.prisma` — 3 models + 2 enums novos + `Prescription.refractionExamId`.
- Create: `prisma/migrations/<ts>_vis_medical_clinico_f1/migration.sql`.

**Gate clínico compartilhado (Task 2):**
- Create: `src/lib/clinical-guard.ts` — `requireClinicalContext()` (permissão + platformProduct + consentimento) + constante de scope.
- Test: `src/lib/__tests__/clinical-guard.test.ts`.

**Agenda clínica (Task 3):**
- Create: `src/lib/validations/clinical-appointment.schema.ts`, `src/services/clinical-appointment.service.ts`, `src/app/api/clinical/appointments/route.ts` (+ `[id]/status/route.ts`).
- Test: `src/services/__tests__/clinical-appointment.service.test.ts`.

**Encounter / prontuário (Task 4):**
- Create: `src/lib/validations/encounter.schema.ts`, `src/services/encounter.service.ts`, `src/app/api/clinical/encounters/route.ts` (+ `[id]/route.ts`).
- Test: `src/services/__tests__/encounter.service.test.ts`.

**Refração + gerar receita (Task 5):**
- Create: `src/lib/validations/refraction.schema.ts`, `src/services/refraction.service.ts` (inclui `issuePrescriptionFromRefraction` reusando `upsertPrescription`), `src/app/api/clinical/refractions/route.ts`, `src/app/api/clinical/refractions/[id]/issue/route.ts`.
- Test: `src/services/__tests__/refraction-issue.service.test.ts`.

**RBAC seed (Task 6):**
- Modify: `src/app/api/permissions/seed/catalog.ts` — garantir `clinical.*` semeadas e mapeadas aos papéis PT (`OFTALMOLOGISTA`/`OPTOMETRISTA`); recepção via grant individual (documentar, não no role).

**UI (Task 7-8):** telas de agenda/fila e workspace de atendimento — fatiadas; reusam DS do Vis + `DiopterKeypad`/`DecimalInput`. (Detalhadas após o backend; ver nota no fim.)

**Verificação final (Task 9).**

---

## Task 1: Schema — 3 models + enums + vínculo

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712130000_vis_medical_clinico_f1/migration.sql`

- [ ] **Step 1: Adicionar enums ao schema**

Antes de `enum PlatformProduct` (ou junto aos enums clínicos), inserir:

```prisma
enum ClinicalAppointmentStatus {
  AGENDADO
  CONFIRMADO
  AGUARDANDO
  EM_ATENDIMENTO
  ATENDIDO
  CANCELADO
  FALTOU
}

enum EncounterStatus {
  OPEN
  SIGNED
}
```

- [ ] **Step 2: Adicionar os 3 models**

```prisma
model ClinicalAppointment {
  id             String    @id @default(cuid())
  companyId      String
  branchId       String?
  customerId     String
  doctorId       String?
  scheduledStart DateTime  @db.Timestamptz
  scheduledEnd   DateTime? @db.Timestamptz
  status         ClinicalAppointmentStatus @default(AGENDADO)
  appointmentType String?
  isFollowUp     Boolean   @default(false)
  originalAppointmentId String?
  notes          String?
  canceledReason String?
  checkedInAt    DateTime? @db.Timestamptz
  startedAt      DateTime? @db.Timestamptz
  completedAt    DateTime? @db.Timestamptz
  canceledAt     DateTime? @db.Timestamptz
  createdByUserId String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  company        Company   @relation(fields: [companyId], references: [id])
  customer       Customer  @relation(fields: [customerId], references: [id])
  doctor         Doctor?   @relation(fields: [doctorId], references: [id])
  original       ClinicalAppointment?  @relation("ClinicalReturn", fields: [originalAppointmentId], references: [id], onDelete: SetNull)
  returns        ClinicalAppointment[] @relation("ClinicalReturn")
  encounter      Encounter?

  @@index([companyId, scheduledStart])
  @@index([companyId, customerId, scheduledStart])
  @@index([companyId, doctorId, scheduledStart])
  @@index([companyId, status])
}

model Encounter {
  id             String   @id @default(cuid())
  companyId      String
  branchId       String?
  customerId     String
  appointmentId  String?  @unique
  doctorId       String?
  performedByUserId String
  status         EncounterStatus @default(OPEN)
  chiefComplaint String?
  historyPresentIllness String?
  pastHistory    String?
  familyHistory  String?
  medications    String?
  physicalExam   String?
  vitalSigns     Json?
  diagnosis      String?
  treatmentPlan  String?
  observations   String?
  signedAt       DateTime? @db.Timestamptz
  signedByUserId String?
  createdByUserId String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  company        Company   @relation(fields: [companyId], references: [id])
  customer       Customer  @relation(fields: [customerId], references: [id])
  doctor         Doctor?   @relation(fields: [doctorId], references: [id])
  appointment    ClinicalAppointment? @relation(fields: [appointmentId], references: [id])
  refraction     RefractionExam?

  @@index([companyId, customerId, createdAt])
}

model RefractionExam {
  id          String   @id @default(cuid())
  companyId   String
  encounterId String   @unique
  method      String?
  odSph       Decimal? @db.Decimal(6, 2)
  odCyl       Decimal? @db.Decimal(6, 2)
  odAxis      Int?
  odAdd       Decimal? @db.Decimal(6, 2)
  oeSph       Decimal? @db.Decimal(6, 2)
  oeCyl       Decimal? @db.Decimal(6, 2)
  oeAxis      Int?
  oeAdd       Decimal? @db.Decimal(6, 2)
  pdFar       Decimal? @db.Decimal(5, 2)
  pdNear      Decimal? @db.Decimal(5, 2)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  company     Company   @relation(fields: [companyId], references: [id])
  encounter   Encounter @relation(fields: [encounterId], references: [id])
}
```

E em `model Prescription`, adicionar o campo de vínculo + relação:

```prisma
  refractionExamId String? @unique
```

E as back-relations correspondentes em `Company`, `Customer`, `Doctor` (arrays: `clinicalAppointments ClinicalAppointment[]`, `encounters Encounter[]`, `refractionExams RefractionExam[]`) — o `prisma validate` vai exigir; adicionar conforme o erro apontar.

> Nota: `RefractionExam` NÃO tem FK direta para `Prescription`. O vínculo mora em `Prescription.refractionExamId` (aponta pra trás, padrão saleId). Adicionar a relação inversa em `Prescription`:
> `refractionExam RefractionExam? @relation(fields: [refractionExamId], references: [id], onDelete: SetNull)` — e `prescription Prescription?` em RefractionExam via `@relation`. Ajustar nomes de relação se `prisma validate` reclamar de ambiguidade.

- [ ] **Step 3: Escrever a migração .sql**

Criar `prisma/migrations/20260712130000_vis_medical_clinico_f1/migration.sql` (seguir o padrão do exam_appointment: CREATE TYPE + CREATE TABLE + índices + FKs; Timestamptz nos campos de horário; idempotente com IF NOT EXISTS):

```sql
-- Vis Medical Fatia 1: agenda clínica + prontuário + refração.
-- Aditiva. Enums novos NASCEM completos (CREATE TYPE). Timestamptz em horários.

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ClinicalAppointmentStatus') THEN
  CREATE TYPE "ClinicalAppointmentStatus" AS ENUM ('AGENDADO','CONFIRMADO','AGUARDANDO','EM_ATENDIMENTO','ATENDIDO','CANCELADO','FALTOU');
END IF; END$$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='EncounterStatus') THEN
  CREATE TYPE "EncounterStatus" AS ENUM ('OPEN','SIGNED');
END IF; END$$;

CREATE TABLE IF NOT EXISTS "ClinicalAppointment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT NOT NULL,
  "doctorId" TEXT,
  "scheduledStart" TIMESTAMPTZ NOT NULL,
  "scheduledEnd" TIMESTAMPTZ,
  "status" "ClinicalAppointmentStatus" NOT NULL DEFAULT 'AGENDADO',
  "appointmentType" TEXT,
  "isFollowUp" BOOLEAN NOT NULL DEFAULT false,
  "originalAppointmentId" TEXT,
  "notes" TEXT,
  "canceledReason" TEXT,
  "checkedInAt" TIMESTAMPTZ,
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "canceledAt" TIMESTAMPTZ,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicalAppointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Encounter" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "doctorId" TEXT,
  "performedByUserId" TEXT NOT NULL,
  "status" "EncounterStatus" NOT NULL DEFAULT 'OPEN',
  "chiefComplaint" TEXT, "historyPresentIllness" TEXT, "pastHistory" TEXT,
  "familyHistory" TEXT, "medications" TEXT, "physicalExam" TEXT,
  "vitalSigns" JSONB, "diagnosis" TEXT, "treatmentPlan" TEXT, "observations" TEXT,
  "signedAt" TIMESTAMPTZ, "signedByUserId" TEXT, "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RefractionExam" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "encounterId" TEXT NOT NULL,
  "method" TEXT,
  "odSph" DECIMAL(6,2), "odCyl" DECIMAL(6,2), "odAxis" INTEGER, "odAdd" DECIMAL(6,2),
  "oeSph" DECIMAL(6,2), "oeCyl" DECIMAL(6,2), "oeAxis" INTEGER, "oeAdd" DECIMAL(6,2),
  "pdFar" DECIMAL(5,2), "pdNear" DECIMAL(5,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefractionExam_pkey" PRIMARY KEY ("id")
);

-- Coluna de vínculo em Prescription (aditiva, nullable, sem backfill)
ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "refractionExamId" TEXT;

-- Únicos
CREATE UNIQUE INDEX IF NOT EXISTS "Encounter_appointmentId_key" ON "Encounter"("appointmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "RefractionExam_encounterId_key" ON "RefractionExam"("encounterId");
CREATE UNIQUE INDEX IF NOT EXISTS "Prescription_refractionExamId_key" ON "Prescription"("refractionExamId");

-- Índices multi-tenant (companyId líder)
CREATE INDEX IF NOT EXISTS "ClinicalAppointment_companyId_scheduledStart_idx" ON "ClinicalAppointment"("companyId","scheduledStart");
CREATE INDEX IF NOT EXISTS "ClinicalAppointment_companyId_customerId_scheduledStart_idx" ON "ClinicalAppointment"("companyId","customerId","scheduledStart");
CREATE INDEX IF NOT EXISTS "ClinicalAppointment_companyId_doctorId_scheduledStart_idx" ON "ClinicalAppointment"("companyId","doctorId","scheduledStart");
CREATE INDEX IF NOT EXISTS "ClinicalAppointment_companyId_status_idx" ON "ClinicalAppointment"("companyId","status");
CREATE INDEX IF NOT EXISTS "Encounter_companyId_customerId_createdAt_idx" ON "Encounter"("companyId","customerId","createdAt");

-- Anti-double-booking: mesmo instante exato por médico (NÃO overlap de intervalo)
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalAppointment_no_double_booking"
  ON "ClinicalAppointment"("companyId","doctorId","scheduledStart")
  WHERE "status" NOT IN ('CANCELADO','FALTOU') AND "doctorId" IS NOT NULL;

-- FKs
ALTER TABLE "ClinicalAppointment" ADD CONSTRAINT "ClinicalAppointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicalAppointment" ADD CONSTRAINT "ClinicalAppointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalAppointment" ADD CONSTRAINT "ClinicalAppointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalAppointment" ADD CONSTRAINT "ClinicalAppointment_originalAppointmentId_fkey" FOREIGN KEY ("originalAppointmentId") REFERENCES "ClinicalAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "ClinicalAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefractionExam" ADD CONSTRAINT "RefractionExam_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefractionExam" ADD CONSTRAINT "RefractionExam_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_refractionExamId_fkey" FOREIGN KEY ("refractionExamId") REFERENCES "RefractionExam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Validar + gerar client**

Run: `cd <worktree> && set -a && source /Users/matheusreboucas/PDV\ OTICA/.env && set +a && node ./node_modules/prisma/build/index.js validate && node ./node_modules/prisma/build/index.js generate`
Expected: schema válido + client gerado. NÃO rodar migrate dev/deploy.

- [ ] **Step 5: Commit** (`git commit --no-verify -m "feat(vis-medical-clinico): F1 schema — ClinicalAppointment/Encounter/RefractionExam + vínculo"`)

---

## Task 2: Gate clínico compartilhado

**Files:**
- Create: `src/lib/clinical-guard.ts`
- Test: `src/lib/__tests__/clinical-guard.test.ts`

- [ ] **Step 1: Teste falho** — `clinical-guard.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { CLINICAL_CONSENT_SCOPE, isVisMedicalCompany } from "@/lib/clinical-guard";

describe("clinical guard", () => {
  it("define o scope de consentimento clínico canônico", () => {
    expect(CLINICAL_CONSENT_SCOPE).toBe("clinical_health_data");
  });
  it("isVisMedicalCompany true só para VIS_MEDICAL", () => {
    expect(isVisMedicalCompany("VIS_MEDICAL")).toBe(true);
    expect(isVisMedicalCompany("VIS_APP")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar, confirmar falha.** `./node_modules/.bin/vitest run src/lib/__tests__/clinical-guard.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/lib/clinical-guard.ts`:**

```ts
import { prisma } from "@/lib/prisma";
import { requirePermission, getCompanyId } from "@/lib/auth-helpers";
import { forbiddenError } from "@/lib/error-handler";
import type { Permission } from "@/lib/permissions";

/** Scope canônico de consentimento para dado de saúde (LGPD Art. 11). String constante — nunca livre. */
export const CLINICAL_CONSENT_SCOPE = "clinical_health_data";

export function isVisMedicalCompany(platformProduct: string): boolean {
  return platformProduct === "VIS_MEDICAL";
}

/**
 * Gate de todo acesso a dado clínico:
 * 1. requirePermission (granular)
 * 2. Company.platformProduct === VIS_MEDICAL — porque requirePermission dá passe livre
 *    ao ADMIN (auth-permissions.ts:24) e o ADMIN herda clinical.* (Object.values(Permission)).
 *    Sem esse gate, um ADMIN de conta VIS_APP alcançaria dado clínico.
 * Retorna { companyId } para uso na query.
 */
export async function requireClinicalContext(permission: Permission | string): Promise<{ companyId: string }> {
  await requirePermission(permission);
  const companyId = await getCompanyId();
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { platformProduct: true },
  });
  if (!company || !isVisMedicalCompany(company.platformProduct)) {
    throw forbiddenError("Contexto clínico exige uma conta Vis Medical.");
  }
  return { companyId };
}

/** Consentimento clínico vigente (não revogado) para o paciente, antes de escrever dado clínico. */
export async function assertClinicalConsent(companyId: string, customerId: string): Promise<void> {
  const consent = await prisma.consentRecord.findFirst({
    where: { companyId, customerId, scope: { contains: CLINICAL_CONSENT_SCOPE }, revokedAt: null },
  });
  if (!consent) {
    throw forbiddenError("Consentimento clínico do paciente não registrado ou revogado.");
  }
}
```

> Verificar ao implementar: nome real do model de consentimento no client Prisma (`consentRecord`) e os campos (`companyId`, `customerId`, `scope`, `revokedAt`) — confirmados no schema L524-543. Ajustar se o `scope` for igualdade exata em vez de CSV `contains`.

- [ ] **Step 4: Rodar, confirmar passa.** Vitest → PASS.
- [ ] **Step 5: tsc + commit** (`--no-verify`).

---

## Task 3: Agenda clínica (service + rotas + transições)

**Files:**
- Create: `src/lib/validations/clinical-appointment.schema.ts`, `src/services/clinical-appointment.service.ts`, `src/app/api/clinical/appointments/route.ts`, `src/app/api/clinical/appointments/[id]/status/route.ts`
- Test: `src/services/__tests__/clinical-appointment.service.test.ts`

- [ ] **Step 1: Teste falho — transições de status.** As transições são função pura testável:

```ts
import { describe, it, expect } from "vitest";
import { canTransition, ALLOWED_TRANSITIONS } from "@/services/clinical-appointment.service";

describe("ClinicalAppointment transitions", () => {
  it("permite AGENDADO→AGUARDANDO, rejeita AGENDADO→ATENDIDO", () => {
    expect(canTransition("AGENDADO", "AGUARDANDO")).toBe(true);
    expect(canTransition("AGENDADO", "ATENDIDO")).toBe(false);
  });
  it("ATENDIDO é terminal", () => {
    expect(ALLOWED_TRANSITIONS.ATENDIDO).toEqual([]);
  });
  it("reabre CANCELADO→AGENDADO", () => {
    expect(canTransition("CANCELADO", "AGENDADO")).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar, confirmar falha.**

- [ ] **Step 3: Implementar service** com `ALLOWED_TRANSITIONS`/`canTransition` (puros) + `createClinicalAppointment`/`listClinicalAppointmentsForDay`/`updateClinicalAppointmentStatus` (recebendo `companyId`, escopo multi-tenant, timestamp por transição). Seguir o formato de `exam-appointment.service.ts`. `canTransition`:

```ts
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  AGENDADO: ["CONFIRMADO", "AGUARDANDO", "CANCELADO", "FALTOU"],
  CONFIRMADO: ["AGUARDANDO", "CANCELADO", "FALTOU"],
  AGUARDANDO: ["EM_ATENDIMENTO", "CANCELADO", "FALTOU"],
  EM_ATENDIMENTO: ["ATENDIDO", "CANCELADO"],
  ATENDIDO: [],
  CANCELADO: ["AGENDADO"],
  FALTOU: ["AGENDADO"],
};
export function canTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}
```

O `updateClinicalAppointmentStatus` valida `canTransition`, grava o timestamp certo (AGUARDANDO→checkedInAt, EM_ATENDIMENTO→startedAt, ATENDIDO→completedAt, CANCELADO→canceledAt), e verifica que a row pertence ao `companyId` (anti-IDOR).

- [ ] **Step 4: Rodar, confirmar passa.**

- [ ] **Step 5: Rotas** — `POST/GET /api/clinical/appointments` e `PATCH /api/clinical/appointments/[id]/status`, seguindo EXATAMENTE o padrão de `exam-appointments/route.ts`, mas usando `requireClinicalContext("clinical.appointment.manage")` no lugar de `requireAuth()+requirePermission()` (o guard já faz os dois + gate de produto). Ex.:

```ts
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await requireClinicalContext("clinical.appointment.manage");
    const userId = await getUserId();
    const body = createClinicalAppointmentSchema.parse(await req.json());
    const appt = await createClinicalAppointment(body, companyId, userId);
    return createdResponse(appt);
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 6: tsc + commit.**

---

## Task 4: Encounter / prontuário (com guard de imutabilidade + DTO sem SOAP)

**Files:**
- Create: `src/lib/validations/encounter.schema.ts`, `src/services/encounter.service.ts`, `src/app/api/clinical/encounters/route.ts`, `src/app/api/clinical/encounters/[id]/route.ts`
- Test: `src/services/__tests__/encounter.service.test.ts`

- [ ] **Step 1: Testes falhos** — dois comportamentos-chave: (a) editar Encounter SIGNED lança; (b) o DTO de agenda NÃO contém campos SOAP.

```ts
import { describe, it, expect } from "vitest";
import { assertEncounterEditable, toAppointmentDTO } from "@/services/encounter.service";

describe("encounter guards", () => {
  it("rejeita edição de Encounter SIGNED", () => {
    expect(() => assertEncounterEditable("SIGNED")).toThrow();
    expect(() => assertEncounterEditable("OPEN")).not.toThrow();
  });
  it("DTO de agenda NUNCA expõe campos de prontuário", () => {
    const dto = toAppointmentDTO({
      id: "a", customerId: "c", scheduledStart: new Date(), status: "AGUARDANDO",
      // campos clínicos que NÃO podem vazar:
      chiefComplaint: "dor", diagnosis: "x",
    } as any);
    expect(dto).not.toHaveProperty("chiefComplaint");
    expect(dto).not.toHaveProperty("diagnosis");
  });
});
```

- [ ] **Step 2: Rodar, confirmar falha.**

- [ ] **Step 3: Implementar service:** `assertEncounterEditable(status)` (guard puro: `if status==="SIGNED" throw businessRuleError`), `toAppointmentDTO(row)` (whitelist explícita — só id/customerId/customerName/scheduledStart/status/doctorId, NUNCA campos SOAP), `createOrUpdateEncounter` (idempotente por appointmentId; chama `assertClinicalConsent` antes de escrever; grava `CustomerAccessLog` com resourceType "clinical_encounter"), `signEncounter` (status→SIGNED, signedAt). Leitura de Encounter não-SIGNED restrita a `performedByUserId`/`doctorId` (+ admin).

- [ ] **Step 4: Rodar, confirmar passa.**

- [ ] **Step 5: Rotas** — `POST /api/clinical/encounters` (cria/atualiza, `requireClinicalContext("clinical.encounter.create")`), `GET/PATCH /api/clinical/encounters/[id]`. O GET grava CustomerAccessLog de leitura.

- [ ] **Step 6: tsc + commit.**

---

## Task 5: Refração + gerar receita (reusa upsertPrescription)

**Files:**
- Create: `src/lib/validations/refraction.schema.ts`, `src/services/refraction.service.ts`, `src/app/api/clinical/refractions/route.ts`, `src/app/api/clinical/refractions/[id]/issue/route.ts`
- Test: `src/services/__tests__/refraction-issue.service.test.ts`

- [ ] **Step 1: Teste falho — a decisão de emissão (guard de duplo-clique + doctorId obrigatório).** Função pura:

```ts
import { describe, it, expect } from "vitest";
import { assertIssuable } from "@/services/refraction.service";

describe("issue prescription from refraction", () => {
  it("exige doctorId no momento da emissão", () => {
    expect(() => assertIssuable({ refractionExamId: null, doctorId: "d" })).not.toThrow();
    expect(() => assertIssuable({ refractionExamId: null, doctorId: null })).toThrow(/doctorId/i);
  });
  it("rejeita re-emissão (refractionExamId já vinculado)", () => {
    expect(() => assertIssuable({ refractionExamId: "px", doctorId: "d" })).toThrow(/já/i);
  });
});
```

- [ ] **Step 2: Rodar, confirmar falha.**

- [ ] **Step 3: Implementar.** `assertIssuable({refractionExamId, doctorId})` (puro: doctorId null→throw; refractionExamId já setado→throw). `issuePrescriptionFromRefraction(refractionExamId, companyId, doctorId, userId)`:
  - Transação: revalida guard (`SELECT refractionExamId FROM Prescription WHERE refractionExamId = $id` — se existe, throw); lê `RefractionExam`; chama `assertClinicalConsent`; chama **`upsertPrescription`** (reuso de `livro-receitas.service.ts`) passando os valores de grau mapeados (`odSph/odCyl/odAxis/odAdd/oeSph/oeCyl/oeAxis/oeAdd/pdFar/pdNear` — nomes idênticos, cópia 1:1), `doctorId`, `companyId`, `customerId` (do Encounter), `createdByUserId: userId`; seta `Prescription.refractionExamId = refractionExamId`; grava CustomerAccessLog "clinical_prescription".
  - O guard de duplo-clique é o `refractionExamId @unique` + o SELECT prévio na transação.

- [ ] **Step 4: Rodar, confirmar passa.**

- [ ] **Step 5: Rotas** — `POST /api/clinical/refractions` (cria/atualiza refração, `requireClinicalContext("clinical.exam.create")`), `POST /api/clinical/refractions/[id]/issue` (`requireClinicalContext("clinical.prescription.issue")`).

- [ ] **Step 6: tsc + commit.**

---

## Task 6: RBAC seed clínico

**Files:**
- Modify: `src/app/api/permissions/seed/catalog.ts`

- [ ] **Step 1:** Confirmar que os 6 códigos `clinical.*` estão no array `PERMISSIONS` do catalog (a F0 os adicionou — verificar). Confirmar que os papéis `OFTALMOLOGISTA`/`OPTOMETRISTA` no `ROLE_PERMISSIONS_MAP` recebem os 6 códigos clínicos + `clinical.appointment.manage`. Se faltar `clinical.appointment.manage` nos papéis clínicos, adicionar.
- [ ] **Step 2:** Documentar (comentário no catalog) que a RECEPÇÃO (`ATENDENTE`) NÃO recebe `clinical.appointment.manage` pelo role — é grant individual via `UserPermission` na aba de Usuários. NÃO adicionar ao role ATENDENTE (vazaria p/ VIS_APP).
- [ ] **Step 3:** tsc + commit. (Seed roda em runtime via `POST /api/permissions/seed`; o dono roda após deploy — anotar.)

---

## Task 7-8: UI (agenda/fila + workspace de atendimento)

> UI detalhada em subtarefas ao implementar, seguindo `2026-07-12-vis-medical-clinico-design-system.md`. Pontos fixos:
> - Reusar DS do Vis (PageContainer, StatusBadge por token, componentes mobile do overhaul).
> - Grade de refração REUSA `DiopterKeypad` (`src/components/prescriptions/diopter-keypad.tsx`) + `DecimalInput` (`src/components/ui/decimal-input.tsx`) + inspecionar `prescription-grade-form.tsx` como base.
> - Workspace 2 colunas (contexto paciente read-only + abas Prontuário|Refração); colapsa no mobile.
> - Auto-save localStorage (não servidor); "gerar receita" com revisão explícita.
> - Recepção: tela de agenda usa o DTO sem campos SOAP (Task 4).

Cada tela = uma subtarefa (componente → wireup à rota → teste de render/acesso). Fatiar ao chegar aqui; não detalhado agora para não inflar o plano antes do backend estar de pé.

---

## Task 9: Verificação final (OBRIGATÓRIA)

- [ ] `./node_modules/.bin/tsc --noEmit` → 0 erros.
- [ ] `set -a; source .env; set +a; ./node_modules/.bin/vitest run` → todos passam (incl. os novos + regressão Vis App).
- [ ] `./node_modules/.bin/next build` → sucesso.
- [ ] **Não-regressão:** confirmar que nenhuma tabela/rota do Vis App mudou comportamento; migração é aditiva.
- [ ] **Aplicar migração em prod: SÓ com OK do dono.** Ordem: `migrate deploy` ANTES do deploy. Depois: seed de permissões (`POST /api/permissions/seed`).
- [ ] Commit final.

---

## Sequenciamento
Task 1 (schema) → Task 2 (guard) → Tasks 3,4,5 dependem de 1+2 (podem ser sequenciais; 5 depende de 4 pro customerId do Encounter) → Task 6 (RBAC) independente → Tasks 7-8 (UI) dependem do backend → Task 9.

## Fora da fatia 1 (fases seguintes)
form_templates dinâmicos, exames satélite (ClinicalExam), EncounterAmendment append-only, atestado/declaração, laudos, painel TV, agendamento público, financeiro/caixa clínico, ponte receita→venda cross-produto.
