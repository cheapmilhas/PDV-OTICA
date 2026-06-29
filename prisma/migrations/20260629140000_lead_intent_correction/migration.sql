-- Fase 3 (IA contexto cliente): telemetria de acurácia da classificação de intenção.
-- ADITIVA: guarda o palpite ORIGINAL da IA + quem/quando corrigiu. Lead.intent
-- continua sendo a "verdade atual" (corrigida pelo humano quando aplicável).
-- Acurácia = comparar intent (atual) vs intentPredicted (original da IA).
-- Nullable + sem default novo → zero impacto em linhas existentes.

ALTER TABLE "Lead" ADD COLUMN "intentPredicted" "ContactIntent";
ALTER TABLE "Lead" ADD COLUMN "intentCorrectedById" TEXT;
ALTER TABLE "Lead" ADD COLUMN "intentCorrectedAt" TIMESTAMP(3);

-- Índice p/ o dashboard de acurácia (varre leads com palpite da IA por empresa).
CREATE INDEX "Lead_companyId_intentPredicted_idx" ON "Lead"("companyId", "intentPredicted");
