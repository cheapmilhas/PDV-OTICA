-- CreateTable
CREATE TABLE "LensKnowledgeDoc" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokensEstimate" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LensKnowledgeDoc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LensKnowledgeDoc_companyId_active_idx" ON "LensKnowledgeDoc"("companyId", "active");

-- AlterTable: AiTokenUsage.companyId passa a aceitar NULL (playground)
ALTER TABLE "AiTokenUsage" ALTER COLUMN "companyId" DROP NOT NULL;
