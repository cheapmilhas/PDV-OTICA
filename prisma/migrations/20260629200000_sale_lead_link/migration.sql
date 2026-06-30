-- Funil Inteligente — Fatia 1: elo determinístico Lead↔Sale para auto-Ganho.
-- ADITIVA: 1 coluna nullable + FK SetNull + índice. Sem backfill (vendas antigas
-- ficam com leadId NULL; o vínculo só passa a existir em vendas novas).
--
-- Locks: ADD COLUMN nullable s/ default = catalog-only (instantâneo). ADD FK e
-- CREATE INDEX (sem CONCURRENTLY) pegam lock breve na Sale — Prisma migrate roda
-- em transação e NÃO suporta CONCURRENTLY; mesma decisão consciente da migração
-- 20260527180000 (tabela ainda pequena ~16k linhas → scan/build sub-segundo).

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "leadId" TEXT;

-- FK SetNull: não prende exclusão de Lead (mesmo padrão de Lead.customerId/quoteId).
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Sale_leadId_idx" ON "Sale"("leadId");
