-- Q8.1.2: timestamp da última falha de processamento do webhook (BillingEvent).
-- Complementa `error` (mensagem) e `retryCount` (nº de tentativas) com QUANDO
-- falhou pela última vez — observabilidade de webhooks travados/abandonados.
-- Migration ADITIVA, idempotente, sem destrutivo.

ALTER TABLE "BillingEvent" ADD COLUMN IF NOT EXISTS "lastErrorAt" TIMESTAMP(3);
