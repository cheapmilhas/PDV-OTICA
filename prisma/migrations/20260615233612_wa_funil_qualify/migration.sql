-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WhatsappConversation" ADD COLUMN     "analysisAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isGroup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsAnalysis" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "WhatsappConversation_companyId_isGroup_analyzedAt_idx" ON "WhatsappConversation"("companyId", "isGroup", "analyzedAt");

