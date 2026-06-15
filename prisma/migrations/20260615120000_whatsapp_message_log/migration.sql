-- CreateEnum
CREATE TYPE "WhatsappMessageType" AS ENUM ('SHARE_LINK', 'OS_READY', 'POST_SALE', 'BIRTHDAY', 'INSTALLMENT_DUE');

-- CreateEnum
CREATE TYPE "WhatsappMessageStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "WhatsappMessageLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "type" "WhatsappMessageType" NOT NULL,
    "phone" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "WhatsappMessageStatus" NOT NULL,
    "skipReason" TEXT,
    "error" TEXT,
    "evolutionMessageId" TEXT,
    "referenceId" TEXT,
    "periodKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "WhatsappMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappMessageLog_companyId_createdAt_idx" ON "WhatsappMessageLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsappMessageLog_companyId_type_status_idx" ON "WhatsappMessageLog"("companyId", "type", "status");

-- CreateIndex
CREATE INDEX "WhatsappMessageLog_customerId_idx" ON "WhatsappMessageLog"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessageLog_companyId_type_referenceId_periodKey_key" ON "WhatsappMessageLog"("companyId", "type", "referenceId", "periodKey");

-- AddForeignKey
ALTER TABLE "WhatsappMessageLog" ADD CONSTRAINT "WhatsappMessageLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessageLog" ADD CONSTRAINT "WhatsappMessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
