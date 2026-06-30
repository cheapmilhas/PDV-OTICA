-- Funil Inteligente — Fatia 3 (auto-move da IA): autoria do movimento + trava
-- humana inteligente. ADITIVA: 1 enum novo + 3 colunas nullable. Sem backfill
-- (lead sem lastMovedBy = nunca tocado por humano = IA livre, default seguro).

CREATE TYPE "LeadMover" AS ENUM ('USER', 'AI');

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastMovedBy" "LeadMover";
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastHumanMoveAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "aiLockUntilMessageAt" TIMESTAMP(3);
