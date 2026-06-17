-- Travas anti-bloqueio configuráveis do WhatsApp (Fase 2). Migration 100% ADITIVA.
--
-- (1) Tabela global singleton WhatsappGlobalConfig com os DEFAULTS = valores
--     hardcoded da Fase 1 (8h-18h, teto 50, pular sábado off, stale 10) — então
--     o comportamento é IDÊNTICO ao atual até alguém editar pela tela.
-- (2) Overrides opcionais por ótica em CompanySettings (null = usa o global).
--
-- Zero alteração/remoção. ADD COLUMN com IF NOT EXISTS para re-run seguro.

-- CreateTable
CREATE TABLE IF NOT EXISTS "WhatsappGlobalConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "openHour" INTEGER NOT NULL DEFAULT 8,
    "closeHour" INTEGER NOT NULL DEFAULT 18,
    "dailyCap" INTEGER NOT NULL DEFAULT 50,
    "skipSaturday" BOOLEAN NOT NULL DEFAULT false,
    "staleMin" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappGlobalConfig_pkey" PRIMARY KEY ("id")
);

-- AlterTable: overrides por ótica (todos nullable → null = usa o global)
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "waOpenHourOverride" INTEGER,
  ADD COLUMN IF NOT EXISTS "waCloseHourOverride" INTEGER,
  ADD COLUMN IF NOT EXISTS "waDailyCapOverride" INTEGER,
  ADD COLUMN IF NOT EXISTS "waSkipSaturdayOverride" BOOLEAN;
