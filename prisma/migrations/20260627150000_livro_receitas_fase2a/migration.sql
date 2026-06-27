-- ============================================================
-- LIVRO DE RECEITAS — Fase 2a (unicidade por venda + flag exame)
-- Gerado em: 2026-06-27
-- ============================================================
--
-- Operação ADITIVA + 1 troca de índice. Habilita a regra "1 receita por venda"
-- de verdade (no banco, não só em código) e a detecção do produto-exame.
--
-- O que faz:
--   1) Troca o índice NÃO-único de Prescription.saleId por um índice ÚNICO.
--      NULL não colide no Postgres → receitas avulsas (sem venda) convivem.
--      Isto permite upsert idempotente por saleId e impede duplicidade em corrida.
--   2) Adiciona Product.isEyeExam BOOLEAN NOT NULL DEFAULT false — marca o
--      produto-serviço "Exame de Vista" (resistente a rename). Venda com item
--      isEyeExam gera receita mesmo sem lente.
--
-- NÃO altera dados existentes. isEyeExam nasce false para todos os produtos.
--
-- ⚠️ ORDEM DE APLICAÇÃO EM PROD (importante):
--    1. Aplicar ESTA migração (isEyeExam + troca de índice p/ unique) + deploy do código.
--       (A coluna saleId hoje está VAZIA em prod — Livro dormente — então o
--        índice único não pode falhar por duplicata pré-existente.)
--    2. Rodar backfill em dry-run, depois --apply.
--    Como a tabela está vazia hoje, o unique é seguro de imediato. Se algum dia
--    houver dados antes do unique, rodar o backfill idempotente ANTES.
--
-- ⚠️ NÃO APLICADA EM PRODUÇÃO por este passo. Aguardando snapshot/backup do
--    dono antes do `migrate deploy`, padrão do projeto.

-- DropIndex
DROP INDEX "Prescription_saleId_idx";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isEyeExam" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_saleId_key" ON "Prescription"("saleId");
