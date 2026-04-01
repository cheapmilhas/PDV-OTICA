-- CreateTable: ImpersonationSession
CREATE TABLE IF NOT EXISTS "ImpersonationSession" (
  "id"          TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "reason"      TEXT NOT NULL,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"     TIMESTAMP(3),
  "expiresAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GlobalAudit
CREATE TABLE IF NOT EXISTS "GlobalAudit" (
  "id"        TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId"   TEXT,
  "companyId" TEXT,
  "action"    TEXT NOT NULL,
  "metadata"  JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GlobalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ImpersonationSession_companyId_startedAt_idx" ON "ImpersonationSession"("companyId", "startedAt");
CREATE INDEX IF NOT EXISTS "ImpersonationSession_adminUserId_startedAt_idx" ON "ImpersonationSession"("adminUserId", "startedAt");
CREATE INDEX IF NOT EXISTS "ImpersonationSession_expiresAt_idx" ON "ImpersonationSession"("expiresAt");

CREATE INDEX IF NOT EXISTS "GlobalAudit_companyId_createdAt_idx" ON "GlobalAudit"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "GlobalAudit_action_createdAt_idx" ON "GlobalAudit"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "GlobalAudit_actorId_createdAt_idx" ON "GlobalAudit"("actorId", "createdAt");

-- AddForeignKey: ImpersonationSession -> AdminUser
ALTER TABLE "ImpersonationSession"
  ADD CONSTRAINT "ImpersonationSession_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ImpersonationSession -> Company
ALTER TABLE "ImpersonationSession"
  ADD CONSTRAINT "ImpersonationSession_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: GlobalAudit -> AdminUser (opcional)
ALTER TABLE "GlobalAudit"
  ADD CONSTRAINT "GlobalAudit_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: GlobalAudit -> Company (opcional)
ALTER TABLE "GlobalAudit"
  ADD CONSTRAINT "GlobalAudit_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
