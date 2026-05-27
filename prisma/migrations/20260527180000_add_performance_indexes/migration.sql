-- Q7.2 P2-10: 12 índices identificados no audit agent-2-database 2026-05-26.
-- Sem CONCURRENTLY (Prisma migrate não suporta) — db ainda é pequeno,
-- locks são milissegundos. Quando crescer, considerar split em migrations
-- menores e aplicar via psql --concurrently fora do Prisma.

-- Sale: status+completedAt e companyId+completedAt (revenue reports)
CREATE INDEX IF NOT EXISTS "Sale_status_completedAt_idx"
  ON "Sale" ("status", "completedAt");
CREATE INDEX IF NOT EXISTS "Sale_companyId_completedAt_idx"
  ON "Sale" ("companyId", "completedAt");

-- FinanceEntry: 4-col composite pra DRE groupBy(type, side)
CREATE INDEX IF NOT EXISTS "FinanceEntry_companyId_entryDate_type_side_idx"
  ON "FinanceEntry" ("companyId", "entryDate", "type", "side");

-- CardReceivable: saleId pra deleteMany no cancel
CREATE INDEX IF NOT EXISTS "CardReceivable_saleId_idx"
  ON "CardReceivable" ("saleId");

-- AccountReceivable: 4-col composite pra validateCreditLimit em toda venda crediário
CREATE INDEX IF NOT EXISTS "AccountReceivable_customerId_companyId_status_dueDate_idx"
  ON "AccountReceivable" ("customerId", "companyId", "status", "dueDate");

-- EmailQueue: FIFO worker (status + createdAt)
CREATE INDEX IF NOT EXISTS "EmailQueue_status_createdAt_idx"
  ON "email_queue" ("status", "createdAt");

-- BillingEvent: retry-queue scan partial WHERE processedAt IS NULL
CREATE INDEX IF NOT EXISTS "BillingEvent_processedAt_null_idx"
  ON "BillingEvent" ("createdAt") WHERE "processedAt" IS NULL;

-- Reminder + CustomerReminder: due-reminders worker (status + scheduledFor)
CREATE INDEX IF NOT EXISTS "Reminder_status_scheduledFor_idx"
  ON "Reminder" ("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "CustomerReminder_status_scheduledFor_idx"
  ON "customer_reminders" ("status", "scheduledFor");

-- CashMovement: salePaymentId reverse lookup no refund flow
CREATE INDEX IF NOT EXISTS "CashMovement_salePaymentId_idx"
  ON "CashMovement" ("salePaymentId");

-- Refund: branchId pra branch-level reports
CREATE INDEX IF NOT EXISTS "Refund_branchId_idx"
  ON "Refund" ("branchId");

-- BranchStock: low stock per branch
CREATE INDEX IF NOT EXISTS "BranchStock_branchId_quantity_idx"
  ON "branch_stocks" ("branch_id", "quantity");
