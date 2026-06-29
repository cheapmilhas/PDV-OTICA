-- Fase 1 (IA contexto cliente): chave canônica de telefone p/ casar contato↔cliente.
-- ADITIVA: 2 colunas nullable + 2 índices compostos com companyId (multi-tenant).
-- Sem backfill aqui — o backfill roda por script gated (dry-run primeiro).

ALTER TABLE "Customer" ADD COLUMN "phoneNormalized" TEXT;
ALTER TABLE "Customer" ADD COLUMN "phone2Normalized" TEXT;

CREATE INDEX "Customer_companyId_phoneNormalized_idx" ON "Customer"("companyId", "phoneNormalized");
CREATE INDEX "Customer_companyId_phone2Normalized_idx" ON "Customer"("companyId", "phone2Normalized");
