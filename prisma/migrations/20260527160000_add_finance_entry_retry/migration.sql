-- Q7.1 P1-10: retry assíncrono pra falhas de generateSaleEntries.
-- Antes falha era silently swallowed (apenas console.error); agora cria
-- registro aqui e cron /api/cron/retry-finance-entries reprocessa
-- com backoff exponencial (max 5 tentativas).

-- CreateEnum
CREATE TYPE "FinanceEntryRetryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "FinanceEntryRetry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "status" "FinanceEntryRetryStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceEntryRetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntryRetry_saleId_key" ON "FinanceEntryRetry"("saleId");

-- CreateIndex
CREATE INDEX "FinanceEntryRetry_status_nextRetryAt_idx" ON "FinanceEntryRetry"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "FinanceEntryRetry_companyId_status_idx" ON "FinanceEntryRetry"("companyId", "status");

-- AddForeignKey
ALTER TABLE "FinanceEntryRetry" ADD CONSTRAINT "FinanceEntryRetry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
