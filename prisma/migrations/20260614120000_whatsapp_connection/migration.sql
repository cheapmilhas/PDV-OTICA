-- CreateEnum
CREATE TYPE "WhatsappConnStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'FAILED');

-- CreateTable
CREATE TABLE "WhatsappConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "instanceName" TEXT NOT NULL,
    "instanceApiKey" TEXT,
    "status" "WhatsappConnStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connectedNumber" TEXT,
    "lastQrAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConnection_companyId_key" ON "WhatsappConnection"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConnection_instanceName_key" ON "WhatsappConnection"("instanceName");

-- CreateIndex
CREATE INDEX "WhatsappConnection_status_idx" ON "WhatsappConnection"("status");

-- AddForeignKey
ALTER TABLE "WhatsappConnection" ADD CONSTRAINT "WhatsappConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
