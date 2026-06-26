-- ============================================================
-- COMISSÃO — FASE 1: Fundação (motor de comissão por níveis)
-- Gerado em: 2026-06-25
-- ============================================================
--
-- Operação 100% ADITIVA: cria 1 enum + 1 tabela nova. NÃO altera, NÃO
-- remove e NÃO renomeia nada existente. Não toca em Commission,
-- SellerCommission, CommissionConfig, CommissionRule, SellerGoal nem nas
-- tabelas de campanha (ProductCampaign/CampaignBonusEntry) — o motor da Fase 1
-- só LÊ essas.
--
-- ⚠️ NÃO APLICADA EM PRODUÇÃO. Aguardando revisão do SQL pelo Matheus antes de
--    rodar `migrate deploy` contra o Neon (com snapshot/backup antes).
--
-- Tabela SellerCommissionTier: guarda os 3 níveis de meta (mini/meta/mega) por
-- vendedor. userId = NULL é o DEFAULT da ótica; userId preenchido é o OVERRIDE
-- de um vendedor (padrão default+override, espelha AiGlobalConfig).

-- CreateEnum
CREATE TYPE "CommissionTierLevel" AS ENUM ('MINI', 'META', 'MEGA');

-- CreateTable
CREATE TABLE "SellerCommissionTier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "level" "CommissionTierLevel" NOT NULL,
    "targetAmount" DECIMAL(12,2) NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerCommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SellerCommissionTier_companyId_idx" ON "SellerCommissionTier"("companyId");

-- CreateIndex
CREATE INDEX "SellerCommissionTier_userId_idx" ON "SellerCommissionTier"("userId");

-- CreateIndex
-- 1 linha por (empresa, escopo, nível). NULL em userId é um valor distinto no
-- índice único do Postgres → o default da ótica ocupa um slot próprio por nível.
CREATE UNIQUE INDEX "SellerCommissionTier_companyId_userId_level_key" ON "SellerCommissionTier"("companyId", "userId", "level");

-- AddForeignKey
ALTER TABLE "SellerCommissionTier" ADD CONSTRAINT "SellerCommissionTier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerCommissionTier" ADD CONSTRAINT "SellerCommissionTier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
