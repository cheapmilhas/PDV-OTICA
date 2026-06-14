-- AlterEnum
ALTER TYPE "SaasEmailType" ADD VALUE IF NOT EXISTS 'INVOICE_CREATED';
ALTER TYPE "SaasEmailType" ADD VALUE IF NOT EXISTS 'INVOICE_DUE_SOON';

-- AlterTable
ALTER TABLE "SaasEmailConfig"
  ADD COLUMN "invoiceGenerationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "invoiceCreatedEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "invoiceDueSoonEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex (unique parcial implícito: múltiplos NULL em asaasPaymentId são permitidos no Postgres)
CREATE UNIQUE INDEX "Invoice_subscriptionId_asaasPaymentId_key"
  ON "Invoice"("subscriptionId", "asaasPaymentId");

-- CreateTable SaasCounter (contador global do número de fatura, SEM FK de Company)
CREATE TABLE "SaasCounter" (
  "key"   TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SaasCounter_pkey" PRIMARY KEY ("key")
);

-- Semear o contador "invoice" com o MAX atual de INV-NNNNNN (senão reinicia em 1 e colide
-- com faturas manuais já existentes). Extrai o sufixo numérico de "INV-000042" → 42.
INSERT INTO "SaasCounter" ("key", "value")
SELECT 'invoice', COALESCE(MAX(CAST(substring("number" FROM 'INV-0*([0-9]+)$') AS INTEGER)), 0)
FROM "Invoice"
WHERE "number" ~ '^INV-[0-9]+$';
