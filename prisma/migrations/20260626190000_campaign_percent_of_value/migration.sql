-- ============================================================
-- CAMPANHA — tipo "% do valor" (PERCENT_OF_VALUE) — Comissão Fase 2 / Passo 2
-- Gerado em: 2026-06-26
-- ============================================================
--
-- Operação 100% ADITIVA: adiciona 1 valor ao enum CampaignBonusType + 1 coluna
-- nullable em ProductCampaign. NÃO altera, NÃO remove e NÃO renomeia nada
-- existente. Os 5 tipos de bônus atuais (PER_UNIT, MINIMUM_FIXED,
-- MINIMUM_PER_UNIT, PER_PACKAGE, TIERED) e todas as campanhas em produção
-- seguem com comportamento IDÊNTICO — bonusPercent fica NULL pra elas.
--
-- ⚠️ NÃO APLICADA EM PRODUÇÃO. Aguardando revisão do Matheus antes de
--    `migrate deploy` contra o Neon (com snapshot/backup antes).
--
-- Nota Postgres (ALTER TYPE ... ADD VALUE): no Postgres ≥ 12 (Neon roda 15+)
-- adicionar valor a enum É permitido dentro de transação, e o novo valor pode
-- ser usado por statements posteriores na MESMA transação a partir do PG 12.
-- Aqui o ADD COLUMN nem usa o valor novo, então não há restrição. É exatamente
-- o SQL que o `prisma migrate diff` gera.

-- AlterEnum
ALTER TYPE "CampaignBonusType" ADD VALUE 'PERCENT_OF_VALUE';

-- AlterTable
ALTER TABLE "ProductCampaign" ADD COLUMN     "bonusPercent" DECIMAL(5,2);
