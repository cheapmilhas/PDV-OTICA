-- Q8.2.2: novo estado ABANDONED para FinanceEntryRetry.
-- Distingue "esgotou as 5 tentativas automáticas (backoff completo) → precisa de
-- correção manual" de um FAILED genérico. Migration ADITIVA, idempotente.
-- ADD VALUE não roda dentro de transação em versões antigas do Postgres; o Neon
-- (PG 15+) aceita IF NOT EXISTS, tornando o re-run seguro.

ALTER TYPE "FinanceEntryRetryStatus" ADD VALUE IF NOT EXISTS 'ABANDONED';
