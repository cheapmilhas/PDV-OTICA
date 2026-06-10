-- Fase B (automação de setup): config global singleton da sincronização.
-- Registro único id="singleton" criado via upsert no service na 1ª leitura.
-- Entregue DESLIGADO (isEnabled=false) e em SIMULAÇÃO (dryRun=true).
CREATE TABLE "AutoSyncConfig" (
  "id" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMP(3),
  "lastRunSummary" JSONB,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutoSyncConfig_pkey" PRIMARY KEY ("id")
);
