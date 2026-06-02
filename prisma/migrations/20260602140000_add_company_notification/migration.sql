-- F3: Suporte do cliente — notificação do lado do cliente (in-app)
-- Migration ADITIVA (tabela + enum novos). Idempotente. Sem destrutivo.

-- ============================================
-- NOVO ENUM: CompanyNotificationType
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyNotificationType') THEN
    CREATE TYPE "CompanyNotificationType" AS ENUM ('TICKET_REPLY', 'TICKET_STATUS', 'BILLING', 'SYSTEM');
  END IF;
END$$;

-- ============================================
-- NOVA TABELA: company_notifications
-- ============================================

CREATE TABLE IF NOT EXISTS "company_notifications" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT,
  "type" "CompanyNotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "metadata" JSONB,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "company_notifications_companyId_isRead_createdAt_idx" ON "company_notifications"("companyId", "isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "company_notifications_userId_isRead_createdAt_idx" ON "company_notifications"("userId", "isRead", "createdAt");
