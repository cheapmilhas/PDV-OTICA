-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "scopeAllCompanies" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AdminUser" ADD COLUMN "scopedCompanyIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
