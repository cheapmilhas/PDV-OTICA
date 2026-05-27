-- Q7.2 P1-6: aplica tabelas LGPD que estavam no schema mas não no banco
-- (drift do `prisma db push` em produção S6/S7). Resolve risco de
-- ambiente novo precisar setup manual + alinha schema vs banco real.

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termVersion" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAccessLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_customerId_acceptedAt_idx" ON "ConsentRecord"("customerId", "acceptedAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_companyId_acceptedAt_idx" ON "ConsentRecord"("companyId", "acceptedAt");

-- CreateIndex
CREATE INDEX "CustomerAccessLog_customerId_createdAt_idx" ON "CustomerAccessLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerAccessLog_companyId_createdAt_idx" ON "CustomerAccessLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerAccessLog_userId_createdAt_idx" ON "CustomerAccessLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccessLog" ADD CONSTRAINT "CustomerAccessLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
