-- Auditoria 2026-07-02 (Fase 4): índices aditivos. PURAMENTE ADITIVA — nenhum
-- dado é reescrito, nenhuma coluna alterada. Só acelera consultas quentes.
--
-- NOTA DE OPERAÇÃO: em tabelas grandes, `CREATE INDEX` sem CONCURRENTLY toma um
-- lock de escrita durante a construção. Se `Sale`/`ServiceOrder` já tiverem
-- volume alto em produção, prefira aplicar estes índices MANUALMENTE fora do
-- pipeline, com CONCURRENTLY (não pode rodar dentro de transação de migração):
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "Sale_companyId_branchId_status_createdAt_idx"
--     ON "Sale" ("companyId","branchId","status","createdAt");
--   (idem para os demais abaixo)
-- e então marcar esta migração como applied (prisma migrate resolve --applied).
-- Como a base atual é pequena, o CREATE INDEX simples abaixo é seguro.

-- Sale: listagem do PDV filtra companyId+branchId+status+range(createdAt).
CREATE INDEX IF NOT EXISTS "Sale_companyId_branchId_status_createdAt_idx"
  ON "Sale" ("companyId", "branchId", "status", "createdAt");

-- ServiceOrder: FKs sem índice dedicado (relatórios + auto-relacionamento).
CREATE INDEX IF NOT EXISTS "ServiceOrder_createdByUserId_idx"
  ON "ServiceOrder" ("createdByUserId");
CREATE INDEX IF NOT EXISTS "ServiceOrder_deliveredByUserId_idx"
  ON "ServiceOrder" ("deliveredByUserId");
CREATE INDEX IF NOT EXISTS "ServiceOrder_prescriptionId_idx"
  ON "ServiceOrder" ("prescriptionId");
CREATE INDEX IF NOT EXISTS "ServiceOrder_originalOrderId_idx"
  ON "ServiceOrder" ("originalOrderId");
