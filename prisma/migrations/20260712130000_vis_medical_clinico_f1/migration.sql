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
