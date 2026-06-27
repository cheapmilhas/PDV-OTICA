-- ============================================================
-- LIVRO DE RECEITAS — Fase 1 (esquema relacional do fichário)
-- Gerado em: 2026-06-27
-- ============================================================
--
-- Operação 100% ADITIVA. O model relacional `Prescription` (que hoje existe
-- mas está VAZIO/parado — nenhuma tela escreve nele) passa a ser o espelho
-- relacional da receita, alimentando o futuro "Livro de Receitas".
--
-- O que esta migração faz:
--   1) Cria o enum PrescriptionStatus (AGUARDANDO_GRAU | COMPLETA).
--   2) Adiciona 7 colunas NULLABLE/com-default a "Prescription":
--      status, prescriptionImageUrl, isDependente, patientName,
--      patientBirthDate, serviceOrderId, saleId.
--   3) Cria 3 índices (status, serviceOrderId, saleId).
--   4) Cria 2 FKs de ORIGEM com ON DELETE SET NULL.
--
-- NÃO altera, NÃO remove e NÃO renomeia nada existente. As colunas de grau
-- (esférico/cilíndrico/eixo/adição/DNP/altura/prisma/base) JÁ existem em
-- "PrescriptionValues" (1:1 com Prescription) e NÃO são tocadas aqui.
--
-- onDelete: SET NULL nas duas FKs de origem (serviceOrderId, saleId) — decisão
-- de produto: a receita deve PERSISTIR no Livro mesmo que a OS/venda de origem
-- seja apagada. Cascade apagaria a receita junto, o que é o oposto do desejado.
-- A origem (OS / venda direta / avulsa) é inferida por qual vínculo está
-- preenchido; se a origem some, o vínculo vira NULL e a receita continua viva.
--
-- ⚠️ NÃO APLICADA EM PRODUÇÃO. Aplicada SOMENTE numa branch de teste do Neon.
--    Aguardando revisão do Matheus antes de `migrate deploy` contra produção
--    (com snapshot/backup antes).

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('AGUARDANDO_GRAU', 'COMPLETA');

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "isDependente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "patientBirthDate" TIMESTAMP(3),
ADD COLUMN     "patientName" TEXT,
ADD COLUMN     "prescriptionImageUrl" TEXT,
ADD COLUMN     "saleId" TEXT,
ADD COLUMN     "serviceOrderId" TEXT,
ADD COLUMN     "status" "PrescriptionStatus" NOT NULL DEFAULT 'AGUARDANDO_GRAU';

-- CreateIndex
CREATE INDEX "Prescription_companyId_status_idx" ON "Prescription"("companyId", "status");

-- CreateIndex
CREATE INDEX "Prescription_serviceOrderId_idx" ON "Prescription"("serviceOrderId");

-- CreateIndex
CREATE INDEX "Prescription_saleId_idx" ON "Prescription"("saleId");

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
