-- Adiciona campos fiscais (NF/NFCe) em Sale que existem no schema.prisma
-- mas estavam ausentes no banco — drift causava P2022 em /api/sales:
--   "The column `Sale.fiscalNumber` does not exist in the current database."
-- Padrão idêntico ao fix de branch_stocks (commit b8088e0).

ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "fiscalNumber"       TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalSerie"        TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalRef"          TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalError"        TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalSefazCode"    INTEGER,
  ADD COLUMN IF NOT EXISTS "fiscalEmittedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fiscalCanceledAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fiscalCancelReason" TEXT;

-- fiscalRef tem @unique no schema — adiciona índice único correspondente.
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_fiscalRef_key" ON "Sale"("fiscalRef");
