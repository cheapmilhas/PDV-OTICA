-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "iaAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "iaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "iaMonthlyTokenLimit" INTEGER;

-- CreateTable
CREATE TABLE "AiTokenUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheTokens" INTEGER NOT NULL DEFAULT 0,
    "audioSeconds" INTEGER,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiTokenUsage_companyId_createdAt_idx" ON "AiTokenUsage"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AiTokenUsage_companyId_feature_idx" ON "AiTokenUsage"("companyId", "feature");

-- AddForeignKey
ALTER TABLE "AiTokenUsage" ADD CONSTRAINT "AiTokenUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

