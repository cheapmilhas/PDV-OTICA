-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "markupPercentOverride" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "AiGlobalConfig" ADD COLUMN     "openaiKeyEnc" TEXT,
ADD COLUMN     "qualifierModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5';

