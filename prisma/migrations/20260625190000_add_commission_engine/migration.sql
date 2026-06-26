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
-- Unicidade dos OVERRIDES de vendedor: 1 linha por (empresa, vendedor, nível).
-- NULL em userId é "distinto" no Postgres → este índice NÃO cobre o default da
-- ótica (ver o índice parcial abaixo).
CREATE UNIQUE INDEX "SellerCommissionTier_companyId_userId_level_key" ON "SellerCommissionTier"("companyId", "userId", "level");

-- CreateIndex
-- Unicidade do DEFAULT da ótica (userId IS NULL). Como dois NULL não colidem no
-- índice único normal, sem este índice PARCIAL daria p/ cadastrar dois defaults
-- (empresa, NULL, MINI). Garante no máximo 1 default por (empresa, nível).
CREATE UNIQUE INDEX "SellerCommissionTier_companyId_level_default_key" ON "SellerCommissionTier"("companyId", "level") WHERE "userId" IS NULL;

-- AddForeignKey
ALTER TABLE "SellerCommissionTier" ADD CONSTRAINT "SellerCommissionTier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- ON DELETE CASCADE: apagar o vendedor APAGA as metas dele (nunca vira default
-- da ótica). Decisão do Matheus na revisão da Fase 1.
ALTER TABLE "SellerCommissionTier" ADD CONSTRAINT "SellerCommissionTier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
