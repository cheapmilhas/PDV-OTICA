-- CreateTable
CREATE TABLE "CardReceivable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "saleId" TEXT NOT NULL,
    "salePaymentId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "totalInstallments" INTEGER NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2),
    "feePercent" DECIMAL(5,4),
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "settledDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cardBrand" TEXT,
    "acquirer" TEXT,
    "nsu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardReceivable_companyId_idx" ON "CardReceivable"("companyId");

-- CreateIndex
CREATE INDEX "CardReceivable_branchId_idx" ON "CardReceivable"("branchId");

-- CreateIndex
CREATE INDEX "CardReceivable_expectedDate_idx" ON "CardReceivable"("expectedDate");

-- CreateIndex
CREATE INDEX "CardReceivable_status_idx" ON "CardReceivable"("status");

-- CreateIndex
CREATE INDEX "CardReceivable_salePaymentId_idx" ON "CardReceivable"("salePaymentId");

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardReceivable" ADD CONSTRAINT "CardReceivable_salePaymentId_fkey" FOREIGN KEY ("salePaymentId") REFERENCES "SalePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
