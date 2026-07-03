-- Arquivamento de conversas do WhatsApp (troca de número da loja).
-- PURAMENTE ADITIVA: nova coluna nullable + índice. Nenhum dado reescrito;
-- conversas existentes ficam com archivedAt = NULL (ativas).

ALTER TABLE "WhatsappConversation"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Índice p/ inbox/filas filtrarem archivedAt=null e ordenarem por lastMessageAt
-- sem varrer conversas arquivadas conforme o histórico cresce.
CREATE INDEX IF NOT EXISTS "WhatsappConversation_companyId_archivedAt_lastMessageAt_idx"
  ON "WhatsappConversation" ("companyId", "archivedAt", "lastMessageAt");

-- Corte do arquivamento: marca SÓ a troca real de número (não a reconexão do
-- mesmo número). connectedAt não serve porque é regravado a cada 'open'.
ALTER TABLE "WhatsappConnection"
  ADD COLUMN "numberChangedAt" TIMESTAMP(3);
