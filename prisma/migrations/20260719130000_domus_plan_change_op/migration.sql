-- Saga da troca de plano vinda do Domus (Fase 2). Aditiva: cria tipo + tabela
-- novos, nao toca tabela existente. Idempotencia por eventId.
--
-- Ordem dos estados = Asaas-first no upgrade: BILLING_CONFIRMED antes de
-- LOCAL_APPLIED (cobra antes de liberar acesso). Ver src/lib/domus-plan-change.
--
-- CREATE TYPE direto (ledger garante execucao unica). Aplicar so com
-- `prisma migrate deploy` (nunca migrate dev/db push -- .env=prod).

CREATE TYPE "DomusPlanChangeOpState" AS ENUM (
  'RECEIVED',
  'BILLING_REQUESTED',
  'BILLING_CONFIRMED',
  'LOCAL_APPLIED',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "DomusPlanChangeOp" (
  "id"            TEXT NOT NULL,
  "visCompanyId"  TEXT NOT NULL,
  "eventId"       TEXT NOT NULL,
  "requestedTier" TEXT NOT NULL,
  "targetPlanId"  TEXT,
  "state"         "DomusPlanChangeOpState" NOT NULL DEFAULT 'RECEIVED',
  "payloadHash"   TEXT NOT NULL,
  "asaasRef"      TEXT,
  "lastError"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "expiresAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DomusPlanChangeOp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomusPlanChangeOp_eventId_key" ON "DomusPlanChangeOp"("eventId");
CREATE INDEX "DomusPlanChangeOp_visCompanyId_idx" ON "DomusPlanChangeOp"("visCompanyId");
CREATE INDEX "DomusPlanChangeOp_expiresAt_idx" ON "DomusPlanChangeOp"("expiresAt");
