-- CreateEnum
CREATE TYPE "SaasEmailType" AS ENUM ('WELCOME', 'TRIAL_ENDING', 'TRIAL_EXPIRED', 'INVOICE_OVERDUE', 'PAYMENT_CONFIRMED', 'SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_CANCELED');

-- CreateEnum
CREATE TYPE "SaasEmailLogStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "SaasEmailConfig" (
    "id" TEXT NOT NULL,
    "masterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "testEmail" TEXT,
    "welcomeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trialEndingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trialExpiredEnabled" BOOLEAN NOT NULL DEFAULT true,
    "invoiceOverdueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paymentConfirmedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionSuspendedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionCanceledEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaasEmailConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaasEmailLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventType" "SaasEmailType" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "status" "SaasEmailLogStatus" NOT NULL DEFAULT 'PENDING',
    "channels" TEXT NOT NULL DEFAULT 'email',
    "emailQueueId" TEXT,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaasEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaasEmailLog_companyId_createdAt_idx" ON "SaasEmailLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "SaasEmailLog_eventType_createdAt_idx" ON "SaasEmailLog"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SaasEmailLog_companyId_eventType_periodKey_key" ON "SaasEmailLog"("companyId", "eventType", "periodKey");

-- AddForeignKey
ALTER TABLE "SaasEmailLog" ADD CONSTRAINT "SaasEmailLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
