-- Vis Medical F0: papéis clínicos no enum UserRole.
-- Migração DEDICADA e idempotente. Postgres exige que ADD VALUE não seja usado
-- na mesma transação que o adiciona → esta migração NÃO usa os valores, só os cria.
--
-- IMPORTANTE: ADD VALUE deve ser TOP-LEVEL, nunca dentro de DO $$ (bloco = transação
-- implícita → "ALTER TYPE ... ADD cannot run inside a transaction block").
-- Padrão idempotente do projeto: ADD VALUE IF NOT EXISTS (ver
-- 20260702160000_paid_traffic_source_and_ad_bait, 20260603030000_finance_retry_abandoned).

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OFTALMOLOGISTA';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OPTOMETRISTA';
