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
- Enum novo = `CREATE TYPE` via `DO $$ IF NOT EXISTS` (defensivo; migrate deploy roda 1x, então idempotência não é garantida pelos ADD CONSTRAINT — não alegar idempotência total). `ADD VALUE` a enum existente = top-level, nunca em `DO $$`.
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

Back-relations EXATAS a adicionar (o Codex corrigiu: Customer/Doctor NÃO se relacionam com RefractionExam — só com Appointment/Encounter):
- `Company`: `clinicalAppointments ClinicalAppointment[]`, `encounters Encounter[]`, `refractionExams RefractionExam[]`
- `Customer`: `clinicalAppointments ClinicalAppointment[]`, `encounters Encounter[]` (NÃO refractionExams)
- `Doctor`: `clinicalAppointments ClinicalAppointment[]`, `encounters Encounter[]` (NÃO refractionExams)

> Vínculo `Prescription ↔ RefractionExam` (1:1 opcional, sem ambiguidade — só uma relação entre os dois models, o Prisma infere sem nome):
> - em `Prescription`: `refractionExam RefractionExam? @relation(fields: [refractionExamId], references: [id], onDelete: SetNull)` (o campo `refractionExamId String? @unique` já declarado).
> - em `RefractionExam`: `prescription Prescription?` (lado inverso, sem `fields`).
> Isso é suficiente; NÃO precisa de nome de relação explícito.

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

- [ ] **Step 1: Teste falho** — `clinical-guard.test.ts`. Além das funções puras, testar o GATE de verdade com Prisma/auth mockados (o Codex apontou que só testar a constante não sustenta a afirmação de segurança):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CLINICAL_CONSENT_SCOPE, isVisMedicalCompany } from "@/lib/clinical-guard";

// mocks de auth-helpers e prisma (padrão do projeto — ver admin-session.test.ts)
vi.mock("@/lib/auth-helpers", () => ({
  requirePermission: vi.fn(),
  getCompanyId: vi.fn(async () => "co-med"),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { company: { findUnique: vi.fn() }, consentRecord: { findMany: vi.fn() } } }));

describe("clinical guard — puros", () => {
  it("scope canônico", () => { expect(CLINICAL_CONSENT_SCOPE).toBe("clinical_health_data"); });
  it("isVisMedicalCompany", () => {
    expect(isVisMedicalCompany("VIS_MEDICAL")).toBe(true);
    expect(isVisMedicalCompany("VIS_APP")).toBe(false);
  });
});

describe("requireClinicalContext — gate real", () => {
  it("BLOQUEIA conta VIS_APP", async () => {
    const { requireClinicalContext } = await import("@/lib/clinical-guard");
    const { prisma } = await import("@/lib/prisma");
    (prisma.company.findUnique as any).mockResolvedValue({ platformProduct: "VIS_APP" });
    await expect(requireClinicalContext("clinical.encounter.create")).rejects.toThrow();
  });
  it("BLOQUEIA empresa inexistente", async () => {
    const { requireClinicalContext } = await import("@/lib/clinical-guard");
    const { prisma } = await import("@/lib/prisma");
    (prisma.company.findUnique as any).mockResolvedValue(null);
    await expect(requireClinicalContext("clinical.encounter.create")).rejects.toThrow();
  });
  it("PERMITE conta VIS_MEDICAL e retorna companyId", async () => {
    const { requireClinicalContext } = await import("@/lib/clinical-guard");
    const { prisma } = await import("@/lib/prisma");
    (prisma.company.findUnique as any).mockResolvedValue({ platformProduct: "VIS_MEDICAL" });
    await expect(requireClinicalContext("clinical.encounter.create")).resolves.toEqual({ companyId: "co-med" });
  });
});

describe("assertClinicalConsent — token exato, não substring", () => {
  it("REJEITA scope que só contém a substring (ex. 'not_clinical_health_data')", async () => {
    const { assertClinicalConsent } = await import("@/lib/clinical-guard");
    const { prisma } = await import("@/lib/prisma");
    (prisma.consentRecord.findMany as any).mockResolvedValue([{ scope: "not_clinical_health_data" }]);
    await expect(assertClinicalConsent("co", "cust")).rejects.toThrow();
  });
  it("ACEITA scope com o token exato entre outros (CSV)", async () => {
    const { assertClinicalConsent } = await import("@/lib/clinical-guard");
    const { prisma } = await import("@/lib/prisma");
    (prisma.consentRecord.findMany as any).mockResolvedValue([{ scope: "marketing, clinical_health_data" }]);
    await expect(assertClinicalConsent("co", "cust")).resolves.toBeUndefined();
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

/** Consentimento clínico vigente (não revogado) para o paciente, antes de escrever dado clínico.
 *  `scope` é CSV livre (schema L536) → NÃO usar `contains` (substring aceita "not_clinical_health_data").
 *  Buscar candidatos não-revogados e comparar por TOKEN exato (split/trim). */
export async function assertClinicalConsent(companyId: string, customerId: string): Promise<void> {
  const consents = await prisma.consentRecord.findMany({
    where: { companyId, customerId, revokedAt: null },
    select: { scope: true },
  });
  const ok = consents.some((c) =>
    c.scope.split(",").map((s) => s.trim()).includes(CLINICAL_CONSENT_SCOPE),
  );
  if (!ok) throw forbiddenError("Consentimento clínico do paciente não registrado ou revogado.");
}

// Variante que recebe o transaction client (usada na emissão atômica da Task 5):
export async function assertClinicalConsentTx(tx: any, companyId: string, customerId: string): Promise<void> {
  const consents = await tx.consentRecord.findMany({ where: { companyId, customerId, revokedAt: null }, select: { scope: true } });
  const ok = consents.some((c: { scope: string }) => c.scope.split(",").map((s) => s.trim()).includes(CLINICAL_CONSENT_SCOPE));
  if (!ok) throw forbiddenError("Consentimento clínico do paciente não registrado ou revogado.");
}
```

> Confirmado no schema L524-543: model `ConsentRecord` (client: `consentRecord`), campos `companyId`, `customerId`, `scope String`, `revokedAt`. O `scope` é CSV — por isso a comparação por token exato acima (não substring).

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

- [ ] **Step 3: Implementar service:** `assertEncounterEditable(status)` (guard puro: `if status==="SIGNED" throw businessRuleError`), `toAppointmentDTO(row)` (whitelist explícita — só id/customerId/customerName/scheduledStart/status/doctorId, NUNCA campos SOAP), `createOrUpdateEncounter` (idempotente por appointmentId — usar `prisma.encounter.upsert({ where: { appointmentId }, ... })` OU tratar `P2002` do `@unique`; NÃO find-then-create que sofre race, como o Codex apontou; chama `assertClinicalConsent` antes de escrever; grava `CustomerAccessLog` com resourceType "clinical_encounter"), `signEncounter` (status→SIGNED, signedAt). Leitura de Encounter não-SIGNED restrita a `performedByUserId`/`doctorId` (+ admin). **Nota walk-in:** com `appointmentId=null`, o upsert por appointmentId não serve — nesse caso é create direto (múltiplos NULL não colidem no @unique).

- [ ] **Step 4: Rodar, confirmar passa.**

- [ ] **Step 5: Rotas** — `POST /api/clinical/encounters` (cria/atualiza, `requireClinicalContext("clinical.encounter.create")`), `GET/PATCH /api/clinical/encounters/[id]`. O GET grava CustomerAccessLog de leitura.

- [ ] **Step 6: tsc + commit.**

---

## Task 5: Refração + gerar receita (emissão atômica DEDICADA)

> **Correções da revisão do Codex (confirmadas no código, todas incorporadas abaixo):**
> - **BLOQUEANTE 1:** `upsertPrescription` (`livro-receitas.service.ts`) NÃO aceita `odSph/odCyl` flat — sua entrada é `od: {esf,cil,eixo,add,dnp,...}` / `oe: {...}` (`EyeValuesInput` L28). Mapeamento obrigatório: `odSph→od.esf`, `odCyl→od.cil`, `odAxis→od.eixo`, `odAdd→od.add`, `pdFar→od.dnp`, `pdNear→oe.dnp` (o serviço documenta pd↔dnp como best-effort). 
> - **BLOQUEANTE 2:** `upsertPrescription` usa o `prisma` GLOBAL (L169/L179), NÃO aceita `TransactionClient` → chamá-lo dentro de `$transaction` NÃO o torna atômico. Solução: NÃO reusar `upsertPrescription` cru; escrever uma função de emissão DEDICADA que cria Prescription+Values dentro de `prisma.$transaction(async (tx) => ...)` usando `tx`, com `refractionExamId` setado no MESMO `create` (não em 2 passos), espelhando o padrão de tratamento de `P2002` que o serviço já usa para `saleId` (L200-215).

**Files:**
- Create: `src/lib/validations/refraction.schema.ts`, `src/services/refraction.service.ts`, `src/app/api/clinical/refractions/route.ts`, `src/app/api/clinical/refractions/[id]/issue/route.ts`
- Test: `src/services/__tests__/refraction-issue.service.test.ts`

- [ ] **Step 1: Teste falho — guard de emissão (doctorId obrigatório + já-emitida).** Nome corrigido (`alreadyIssued`, não `refractionExamId` — o exame de entrada SEMPRE existe; o que barra re-emissão é a receita já existir):

```ts
import { describe, it, expect } from "vitest";
import { assertIssuable } from "@/services/refraction.service";

describe("assertIssuable", () => {
  it("exige doctorId no momento da emissão", () => {
    expect(() => assertIssuable({ doctorId: "d", alreadyIssued: false })).not.toThrow();
    expect(() => assertIssuable({ doctorId: null, alreadyIssued: false })).toThrow(/doctorId/i);
  });
  it("rejeita re-emissão quando já existe receita para o exame", () => {
    expect(() => assertIssuable({ doctorId: "d", alreadyIssued: true })).toThrow(/já/i);
  });
});
```

- [ ] **Step 2: Rodar, confirmar falha.**

- [ ] **Step 3: Implementar.**

`assertIssuable({ doctorId, alreadyIssued })` — puro: `if (!doctorId) throw businessRuleError("doctorId obrigatório na emissão")`; `if (alreadyIssued) throw businessRuleError("Receita já emitida para este exame")`.

`buildEyeInput(refraction)` — mapeia o `RefractionExam` para a forma do serviço:
```ts
// od: { esf: odSph, cil: odCyl, eixo: odAxis, add: odAdd, dnp: pdFar }
// oe: { esf: oeSph, cil: oeCyl, eixo: oeAxis, add: oeAdd, dnp: pdNear }
```

`issuePrescriptionFromRefraction(refractionExamId, ctx)` — atômica e cross-tenant-safe:
```ts
export async function issuePrescriptionFromRefraction(
  refractionExamId: string,
  ctx: { companyId: string; doctorId: string; userId: string },
) {
  return prisma.$transaction(async (tx) => {
    // 1. Ler refração ESCOPADA por companyId (anti-IDOR cross-tenant) + o encounter
    const refraction = await tx.refractionExam.findFirst({
      where: { id: refractionExamId, companyId: ctx.companyId },
      include: { encounter: { select: { customerId: true, companyId: true, doctorId: true } } },
    });
    if (!refraction) throw notFoundError("Refração não encontrada nesta clínica.");

    // 2. Validar que o doctorId recebido pertence à MESMA company (não basta a FK existir)
    const doctor = await tx.doctor.findFirst({
      where: { id: ctx.doctorId, companyId: ctx.companyId }, select: { id: true },
    });
    if (!doctor) throw businessRuleError("Médico inválido para esta clínica.");

    // 3. Consentimento clínico vigente (dentro da tx, mesma company)
    await assertClinicalConsentTx(tx, ctx.companyId, refraction.encounter.customerId);

    // 4. Guard de já-emitida
    const existing = await tx.prescription.findUnique({
      where: { refractionExamId }, select: { id: true },
    });
    assertIssuable({ doctorId: ctx.doctorId, alreadyIssued: !!existing });

    // 5. Criar Prescription + Values + vínculo NO MESMO create (tx), tratando P2002 do @unique
    try {
      const created = await tx.prescription.create({
        data: {
          companyId: ctx.companyId,
          customerId: refraction.encounter.customerId,
          doctorId: ctx.doctorId,
          createdByUserId: ctx.userId,
          refractionExamId,
          issuedAt: new Date(),
          expiresAt: addMonths(new Date(), 12),
          status: "COMPLETA",
          values: { create: mapRefractionToValues(refraction) }, // odSph→odSph etc. (nomes idênticos no PrescriptionValues)
        },
        include: { values: true },
      });
      // 6. CustomerAccessLog "clinical_prescription" (dentro da tx)
      await tx.customerAccessLog.create({ data: { companyId: ctx.companyId, customerId: refraction.encounter.customerId, resourceType: "clinical_prescription", resourceId: created.id, action: "issue" } });
      return created;
    } catch (e) {
      // Race de duplo-clique: outro request setou refractionExamId primeiro → P2002 no @unique
      if ((e as { code?: string })?.code === "P2002") {
        const winner = await tx.prescription.findUnique({ where: { refractionExamId } });
        if (winner) return winner; // idempotente: retorna a receita vencedora
      }
      throw e;
    }
  });
}
```
Notas: `mapRefractionToValues` copia `odSph→odSph, odCyl→odCyl, ...` (nomes IDÊNTICOS entre RefractionExam e PrescriptionValues — cópia 1:1 direta no create nested, NÃO passa por `upsertPrescription`). `addMonths` de `date-fns` (já usado no serviço). `assertClinicalConsentTx` = variante que recebe `tx` (adicionar em clinical-guard.ts). A atomicidade é real porque tudo usa `tx`. A idempotência é o `@unique` + tratamento P2002 (padrão do saleId), NÃO o SELECT prévio.

- [ ] **Step 4: Rodar, confirmar passa.**

- [ ] **Step 4b: Bloquear edição de refração após SIGNED/emitida.** No service de refração (`createOrUpdateRefraction`): antes de gravar, se o `Encounter` estiver `SIGNED` OU já existir `Prescription.refractionExamId` apontando pra esta refração → `businessRuleError` (não altera medida que já virou receita/prontuário assinado). Teste dedicado.

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

> **Honestidade de escopo (achado do Codex, aceito):** esta seção é um ESBOÇO, não tarefas executáveis passo-a-passo como as de backend. A UI clínica (workspace de atendimento, grade de refração, fila) merece seu PRÓPRIO plano detalhado — com arquivos/rotas concretos, estados loading/error/empty, autorização de página, contrato de autosave (formato + expiração + reconciliação localStorage↔servidor), a11y/reduced-motion e testes de render. Recomendação: fechar o backend (Tasks 1-6) primeiro, validar o fluxo por API, e então escrever um plano de UI dedicado (com o design-system já pronto). O que segue são os PONTOS FIXOS que esse plano de UI deve respeitar — não a especificação completa:
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
