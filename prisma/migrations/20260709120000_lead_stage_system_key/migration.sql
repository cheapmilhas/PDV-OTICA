-- Flag estável de identidade de estágio (nullable, aditiva). Óticas existentes
-- não são tocadas: systemKey fica NULL até a ação de seed criar as colunas de ótica.
-- Índice único é PARCIAL (WHERE systemKey IS NOT NULL) e hand-written de propósito:
-- NÃO declarar @@unique([companyId, systemKey]) no schema.prisma — o Prisma não
-- suporta índice parcial, então geraria um índice único COMUM e o migrate diff
-- ficaria tentando trocar o parcial pelo comum (drift permanente). O parcial garante
-- no máximo 1 estágio por empresa com cada flag, deixando vários NULLs livres.
ALTER TABLE "LeadStage" ADD COLUMN "systemKey" TEXT;

CREATE UNIQUE INDEX "LeadStage_companyId_systemKey_key"
  ON "LeadStage"("companyId", "systemKey")
  WHERE "systemKey" IS NOT NULL;
