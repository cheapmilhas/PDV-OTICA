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
