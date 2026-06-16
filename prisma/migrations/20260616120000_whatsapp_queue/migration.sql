-- Fila anti-bloqueio do WhatsApp (Fase 1). Migration 100% ADITIVA e idempotente.
--
-- (1) Novos estados do enum WhatsappMessageStatus para a fila de envio:
--     PENDING (enfileirada, aguardando) e PROCESSING (travada por uma execução
--     do processador — claim atômico). SENT/FAILED/SKIPPED já existem.
-- (2) Coluna do aceite das boas-práticas anti-bloqueio (card + checkbox antes do QR).
--
-- ADD VALUE não pode rodar dentro de transação junto com o uso do valor em
-- versões antigas do Postgres; o Neon (PG 15+) aceita IF NOT EXISTS, tornando o
-- re-run seguro. Cada ADD VALUE fica em statement próprio.

ALTER TYPE "WhatsappMessageStatus" ADD VALUE IF NOT EXISTS 'PENDING';

ALTER TYPE "WhatsappMessageStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "waPracticesAcceptedAt" TIMESTAMP(3);
