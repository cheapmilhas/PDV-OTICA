-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN "laboratoryId" TEXT;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
