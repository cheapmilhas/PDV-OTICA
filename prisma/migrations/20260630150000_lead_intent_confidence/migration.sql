-- Funil Inteligente — observabilidade da Fatia 3: persiste a confiança (0-1) da
-- última classificação da IA, p/ auditar por que o auto-move avançou ou segurou
-- um card. ADITIVA: 1 coluna nullable. Sem backfill.

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "intentConfidence" DOUBLE PRECISION;
