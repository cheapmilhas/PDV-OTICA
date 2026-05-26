-- Drift de schema introduzido pelos commits s0/s1 (hardening + features fiscais).
-- O campo fiscalNumber em Sale já foi corrigido na migration anterior; aqui
-- completamos Branch (configuração fiscal NF/NFCe) e Customer (LGPD).
-- Validado via scripts/qa-drift-check.ts.

ALTER TABLE "Branch"
  ADD COLUMN IF NOT EXISTS "fiscalEnabled"       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "fiscalRegime"        TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalCsosn"         TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalCst"           TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalCfopPadrao"    TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalNcmPadrao"     TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalAmbiente"      TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalSerieNfce"     INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "fiscalProximoNumero" INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "fiscalCscId"         TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalCscToken"      TEXT;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "anonymizedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lgpdConsentAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lgpdConsentVersion" TEXT;
