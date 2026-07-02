-- Tráfego pago APROXIMADO (Sprint 3, #9). Aditiva e não-destrutiva.
-- 1) Novo valor PAID_TRAFFIC no enum de origem do lead.
-- 2) Frases-isca do anúncio por ótica (array, default vazio = detecção desligada).
-- Nada é reescrito: leads/configs existentes seguem intactos.

-- AlterEnum: adiciona o valor (idempotente-safe via IF NOT EXISTS).
ALTER TYPE "LeadFunnelSource" ADD VALUE IF NOT EXISTS 'PAID_TRAFFIC';

-- AlterTable: frases-isca por empresa (default array vazio → nenhuma detecção).
ALTER TABLE "CompanySettings"
  ADD COLUMN "waAdBaitPhrases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
