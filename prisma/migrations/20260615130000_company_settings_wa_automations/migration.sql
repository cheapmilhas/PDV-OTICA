-- AlterTable: flags + templates + dias das automações de WhatsApp (Fase B2).
-- Aditiva: todas as colunas têm DEFAULT (ou são nullable), seguras em linhas existentes.
ALTER TABLE "CompanySettings"
  ADD COLUMN "waOsReadyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "waPostSaleEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "waBirthdayEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "waInstallmentDueEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "waOsReadyTemplate" TEXT,
  ADD COLUMN "waPostSaleTemplate" TEXT,
  ADD COLUMN "waBirthdayTemplate" TEXT,
  ADD COLUMN "waInstallmentDueTemplate" TEXT,
  ADD COLUMN "waPostSaleDays" INTEGER NOT NULL DEFAULT 7;
