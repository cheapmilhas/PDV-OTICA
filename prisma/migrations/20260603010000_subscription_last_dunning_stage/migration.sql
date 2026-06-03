-- F5: marco de aviso de inadimplência já dado (régua de dunning).
-- null = nenhum aviso; 3/7/14 = último marco notificado. Zerado na recuperação
-- (volta a ACTIVE). Migration ADITIVA, idempotente, sem destrutivo.

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lastDunningStage" INTEGER;
