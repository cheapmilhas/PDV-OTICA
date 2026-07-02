-- Motivo de perda ESTRUTURADO (Sprint 3, #8).
-- Aditiva e não-destrutiva: cria o enum e adiciona a coluna nullable ao Lead.
-- Leads perdidos ANTES desta migração ficam com lostReasonCategory = NULL
-- (não adivinhamos categoria a partir do texto livre antigo). O texto livre
-- existente (Lead.lostReason) é preservado intacto como detalhe opcional.

-- CreateEnum
CREATE TYPE "LostReasonCategory" AS ENUM (
  'PRICE',
  'COMPETITOR',
  'GAVE_UP',
  'NO_RESPONSE',
  'WRONG_PRODUCT',
  'OTHER'
);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "lostReasonCategory" "LostReasonCategory";
