-- ============================================================
-- SPRINT 1 — SAAS ADMIN EVOLUTION
-- Gerado em: 2026-03-26
-- Aplicar via: Neon console ou psql DIRECT_URL
-- ============================================================

-- ============================================
-- NOVOS ENUMS
-- ============================================

CREATE TYPE "CompanySegment" AS ENUM ('MICRO', 'PEQUENA', 'MEDIA', 'GRANDE');
CREATE TYPE "LeadSource" AS ENUM ('INDICACAO', 'GOOGLE', 'INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'EVENTO', 'DIRETO', 'OUTRO');
CREATE TYPE "TagCategory" AS ENUM ('GENERAL', 'COMMERCIAL', 'SUPPORT', 'BILLING');
CREATE TYPE "ActivityType" AS ENUM (
  'COMPANY_CREATED', 'ONBOARDING_STARTED', 'ONBOARDING_COMPLETED',
  'TRIAL_STARTED', 'TRIAL_EXTENDED', 'TRIAL_EXPIRED',
  'SUBSCRIPTION_CREATED', 'PLAN_CHANGED', 'CYCLE_CHANGED',
  'SUBSCRIPTION_CANCELED', 'SUBSCRIPTION_REACTIVATED',
  'INVOICE_CREATED', 'INVOICE_SENT', 'INVOICE_PAID', 'INVOICE_OVERDUE',
  'COMPANY_BLOCKED', 'COMPANY_UNBLOCKED', 'COMPANY_SUSPENDED',
  'TICKET_OPENED', 'TICKET_RESOLVED', 'TICKET_ESCALATED',
  'FIRST_SALE', 'USAGE_ALERT', 'HEALTH_SCORE_CHANGED',
  'IMPERSONATION', 'NOTE_ADDED', 'USER_CREATED', 'USER_REMOVED',
  'BRANCH_CREATED', 'DATA_UPDATED'
);
CREATE TYPE "ActorType" AS ENUM ('ADMIN', 'CLIENT', 'SYSTEM');
CREATE TYPE "DunningAction" AS ENUM ('REMINDER_EMAIL', 'REMINDER_WHATSAPP', 'WARNING_EMAIL', 'BLOCK_ACCESS', 'CANCEL_SUBSCRIPTION');
CREATE TYPE "DunningChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SYSTEM');
CREATE TYPE "DunningEventStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');
CREATE TYPE "AdminNotificationType" AS ENUM (
  'TRIAL_EXPIRING', 'INVOICE_OVERDUE', 'HEALTH_CRITICAL', 'TICKET_URGENT',
  'ONBOARDING_STALLED', 'SUBSCRIPTION_CANCELED', 'NEW_COMPANY', 'FIRST_SALE', 'SLA_BREACH'
);
CREATE TYPE "ReportType" AS ENUM (
  'MRR_MONTHLY', 'CHURN_MONTHLY', 'TRIAL_CONVERSION', 'REVENUE_BY_PLAN',
  'SUPPORT_METRICS', 'ONBOARDING_FUNNEL', 'USAGE_AGGREGATE'
);
CREATE TYPE "InvoicePaymentMethod" AS ENUM ('PIX', 'BOLETO', 'CARTAO_CREDITO', 'TRANSFERENCIA', 'MANUAL');

-- Estender OnboardingStatus com novos valores
ALTER TYPE "OnboardingStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "OnboardingStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "OnboardingStatus" ADD VALUE IF NOT EXISTS 'STALLED';

-- ============================================
-- NOVOS CAMPOS EM COMPANY
-- ============================================

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "segment" "CompanySegment",
  ADD COLUMN IF NOT EXISTS "sourceDetail" TEXT,
  ADD COLUMN IF NOT EXISTS "contractStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "contractEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "quickNote" TEXT;

CREATE INDEX IF NOT EXISTS "Company_segment_idx" ON "Company"("segment");

-- ============================================
-- NOVOS CAMPOS EM SupportTicket
-- ============================================

ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "slaDeadline" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "slaMet" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "firstResponseAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "csatScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "csatComment" TEXT,
  ADD COLUMN IF NOT EXISTS "templateUsed" TEXT;

CREATE INDEX IF NOT EXISTS "SupportTicket_slaDeadline_idx" ON "SupportTicket"("slaDeadline");

-- ============================================
-- NOVOS CAMPOS EM Invoice
-- ============================================

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "invoicePaymentMethod" "InvoicePaymentMethod",
  ADD COLUMN IF NOT EXISTS "nfeNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "nfeUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);

-- ============================================
-- NOVA TABELA: tags
-- ============================================

CREATE TABLE IF NOT EXISTS "tags" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6B7280',
  "category" "TagCategory" NOT NULL DEFAULT 'GENERAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_key" ON "tags"("name");

-- ============================================
-- NOVA TABELA: company_tags
-- ============================================

CREATE TABLE IF NOT EXISTS "company_tags" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_tags_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_tags_companyId_tagId_key" ON "company_tags"("companyId", "tagId");
CREATE INDEX IF NOT EXISTS "company_tags_companyId_idx" ON "company_tags"("companyId");

-- ============================================
-- NOVA TABELA: ticket_tags
-- ============================================

CREATE TABLE IF NOT EXISTS "ticket_tags" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_tags_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_tags_ticketId_tagId_key" ON "ticket_tags"("ticketId", "tagId");
CREATE INDEX IF NOT EXISTS "ticket_tags_ticketId_idx" ON "ticket_tags"("ticketId");

-- ============================================
-- NOVA TABELA: activity_logs
-- ============================================

CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" "ActivityType" NOT NULL,
  "title" TEXT NOT NULL,
  "detail" JSONB,
  "actorId" TEXT,
  "actorType" "ActorType" NOT NULL DEFAULT 'SYSTEM',
  "actorName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "activity_logs_companyId_createdAt_idx" ON "activity_logs"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_logs_type_idx" ON "activity_logs"("type");

-- ============================================
-- NOVA TABELA: onboarding_checklists
-- ============================================

CREATE TABLE IF NOT EXISTS "onboarding_checklists" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_checklists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_checklists_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_checklists_companyId_key" ON "onboarding_checklists"("companyId");

-- ============================================
-- NOVA TABELA: onboarding_steps
-- ============================================

CREATE TABLE IF NOT EXISTS "onboarding_steps" (
  "id" TEXT NOT NULL,
  "checklistId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "order" INTEGER NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "completedBy" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_steps_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "onboarding_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_steps_checklistId_stepKey_key" ON "onboarding_steps"("checklistId", "stepKey");
CREATE INDEX IF NOT EXISTS "onboarding_steps_checklistId_idx" ON "onboarding_steps"("checklistId");

-- ============================================
-- NOVA TABELA: dunning_rules
-- ============================================

CREATE TABLE IF NOT EXISTS "dunning_rules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "triggerDays" INTEGER NOT NULL,
  "action" "DunningAction" NOT NULL,
  "template" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dunning_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dunning_rules_isActive_order_idx" ON "dunning_rules"("isActive", "order");

-- ============================================
-- NOVA TABELA: dunning_events
-- ============================================

CREATE TABLE IF NOT EXISTS "dunning_events" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "ruleId" TEXT,
  "action" "DunningAction" NOT NULL,
  "channel" "DunningChannel" NOT NULL,
  "status" "DunningEventStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "errorDetail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dunning_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dunning_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dunning_events_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "dunning_events_companyId_createdAt_idx" ON "dunning_events"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "dunning_events_invoiceId_idx" ON "dunning_events"("invoiceId");
CREATE INDEX IF NOT EXISTS "dunning_events_status_idx" ON "dunning_events"("status");

-- ============================================
-- NOVA TABELA: admin_notifications
-- ============================================

CREATE TABLE IF NOT EXISTS "admin_notifications" (
  "id" TEXT NOT NULL,
  "adminId" TEXT,
  "type" "AdminNotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "metadata" JSONB,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_notifications_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "admin_notifications_adminId_isRead_createdAt_idx" ON "admin_notifications"("adminId", "isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "admin_notifications_isRead_createdAt_idx" ON "admin_notifications"("isRead", "createdAt");

-- ============================================
-- NOVA TABELA: sla_policies
-- ============================================

CREATE TABLE IF NOT EXISTS "sla_policies" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priority" "TicketPriority" NOT NULL,
  "firstResponseH" INTEGER NOT NULL,
  "resolutionH" INTEGER NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sla_policies_name_priority_key" ON "sla_policies"("name", "priority");

-- SLAs padrão
INSERT INTO "sla_policies" ("id", "name", "priority", "firstResponseH", "resolutionH", "isDefault")
VALUES
  (gen_random_uuid()::text, 'Padrão', 'LOW', 24, 72, true),
  (gen_random_uuid()::text, 'Padrão', 'MEDIUM', 8, 48, true),
  (gen_random_uuid()::text, 'Padrão', 'HIGH', 4, 24, true),
  (gen_random_uuid()::text, 'Padrão', 'URGENT', 1, 8, true)
ON CONFLICT DO NOTHING;

-- ============================================
-- NOVA TABELA: ticket_response_templates
-- ============================================

CREATE TABLE IF NOT EXISTS "ticket_response_templates" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_response_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ticket_response_templates_isActive_idx" ON "ticket_response_templates"("isActive");

-- ============================================
-- NOVA TABELA: saved_filters
-- ============================================

CREATE TABLE IF NOT EXISTS "saved_filters" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "page" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_filters_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "saved_filters_adminId_page_idx" ON "saved_filters"("adminId", "page");

-- ============================================
-- NOVA TABELA: report_snapshots
-- ============================================

CREATE TABLE IF NOT EXISTS "report_snapshots" (
  "id" TEXT NOT NULL,
  "type" "ReportType" NOT NULL,
  "period" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "report_snapshots_type_period_key" ON "report_snapshots"("type", "period");
CREATE INDEX IF NOT EXISTS "report_snapshots_type_generatedAt_idx" ON "report_snapshots"("type", "generatedAt");

-- ============================================
-- NOVA TABELA: client_portal_configs
-- ============================================

CREATE TABLE IF NOT EXISTS "client_portal_configs" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "canViewInvoices" BOOLEAN NOT NULL DEFAULT true,
  "canChangePlan" BOOLEAN NOT NULL DEFAULT true,
  "canUpdateData" BOOLEAN NOT NULL DEFAULT true,
  "canOpenTickets" BOOLEAN NOT NULL DEFAULT true,
  "canViewUsage" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_portal_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_portal_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_portal_configs_companyId_key" ON "client_portal_configs"("companyId");
