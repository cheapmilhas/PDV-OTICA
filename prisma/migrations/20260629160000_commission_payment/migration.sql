-- Bloco 4: pagamento de comissão do MOTOR NOVO materializado por EMPRESA.
-- ADITIVA: tabela nova + FKs + índice/unique. Zero impacto em dados existentes.
-- Snapshot do valor devido no instante do pagamento (regime de caixa) → dispara
-- a despesa no ledger (COMMISSION_EXPENSE) p/ o DRE parar de ler R$0.

CREATE TABLE "CommissionPayment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "netSales" DECIMAL(12,2) NOT NULL,
  "metaCommission" DECIMAL(10,2) NOT NULL,
  "campaignBonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "totalCommission" DECIMAL(10,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id")
);

-- @unique: 1 pagamento por vendedor/mês/empresa (idempotência do pagamento).
CREATE UNIQUE INDEX "CommissionPayment_companyId_userId_year_month_key"
  ON "CommissionPayment"("companyId", "userId", "year", "month");
CREATE INDEX "CommissionPayment_companyId_year_month_idx"
  ON "CommissionPayment"("companyId", "year", "month");

ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- paidByUserId: quem registrou o pagamento. SetNull p/ não prender exclusão de user.
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_paidByUserId_fkey"
  FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
