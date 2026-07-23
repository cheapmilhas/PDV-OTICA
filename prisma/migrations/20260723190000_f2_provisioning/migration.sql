-- F2 Marco 1 (Sprint 3): provisionamento de clínica Medical no Domus.
-- Estado do provisionamento na Company + outbox durável próprio (não reusa o
-- outbox de entitlement, que é trigger-based). Idempotente onde possível.

-- Enum de estado
DO $$ BEGIN
  CREATE TYPE "ProvisioningState" AS ENUM ('NOT_REQUIRED', 'PROVISIONING', 'PROVISIONED', 'PROVISION_FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Colunas na Company
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "provisioningState" "ProvisioningState" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "provisioningAttemptId" TEXT;

-- Outbox de provisionamento (1:1 com Company)
CREATE TABLE IF NOT EXISTS "ProvisioningOutbox" (
  "companyId"     TEXT PRIMARY KEY,
  "payload"       JSONB NOT NULL,
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failureReason" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProvisioningOutbox_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProvisioningOutbox_nextAttemptAt_idx"
  ON "ProvisioningOutbox"("nextAttemptAt");
