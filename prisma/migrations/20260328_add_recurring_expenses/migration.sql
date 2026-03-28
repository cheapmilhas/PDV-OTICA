-- Add new AccountCategory values
ALTER TYPE "AccountCategory" ADD VALUE IF NOT EXISTS 'ACCOUNTING';
ALTER TYPE "AccountCategory" ADD VALUE IF NOT EXISTS 'INTERNET_PHONE';

-- CreateTable: RecurringExpense
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "description" TEXT NOT NULL,
    "category" "AccountCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 10,
    "supplierId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedAt" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- Add recurringExpenseId to AccountPayable
ALTER TABLE "AccountPayable" ADD COLUMN IF NOT EXISTS "recurringExpenseId" TEXT;

-- CreateIndex
CREATE INDEX "RecurringExpense_companyId_idx" ON "RecurringExpense"("companyId");
CREATE INDEX "RecurringExpense_companyId_active_idx" ON "RecurringExpense"("companyId", "active");
CREATE INDEX "AccountPayable_recurringExpenseId_idx" ON "AccountPayable"("recurringExpenseId");

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
