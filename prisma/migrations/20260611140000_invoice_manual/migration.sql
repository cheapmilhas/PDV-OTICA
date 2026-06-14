-- Cobrança avulsa (Fase 2a): distingue Invoice manual e guarda a origem/motivo
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "isManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "source" TEXT;
