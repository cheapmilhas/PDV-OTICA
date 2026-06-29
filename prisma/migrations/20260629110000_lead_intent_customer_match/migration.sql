-- Fase 1/2 (IA contexto cliente): intenção + estado do match de cliente no Lead.
-- ADITIVA: 2 enums novos + colunas nullable/com default. Sem backfill.

CREATE TYPE "ContactIntent" AS ENUM (
  'NOVA_COMPRA', 'ORCAMENTO_PRECO', 'RENOVACAO', 'COMPROU_RECENTE', 'AGUARDANDO_OS',
  'AGENDAMENTO_INFO', 'CONVENIO_PLANO', 'SEGUNDA_VIA_RECEITA',
  'GARANTIA_CONSERTO', 'RECLAMACAO', 'COBRANCA_FINANCEIRO', 'OUTRO'
);

CREATE TYPE "CustomerMatchKind" AS ENUM ('NONE', 'SINGLE', 'AMBIGUOUS');

ALTER TABLE "Lead" ADD COLUMN "intent" "ContactIntent";
ALTER TABLE "Lead" ADD COLUMN "contactNotPatient" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "customerMatchKind" "CustomerMatchKind" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Lead" ADD COLUMN "suggestedCustomerId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "customerMatchConfirmedById" TEXT;
ALTER TABLE "Lead" ADD COLUMN "customerMatchConfirmedAt" TIMESTAMP(3);

-- FK do cliente sugerido (SetNull p/ não prender exclusão de cliente).
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_suggestedCustomerId_fkey"
  FOREIGN KEY ("suggestedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Lead_suggestedCustomerId_idx" ON "Lead"("suggestedCustomerId");
