-- Item 5: índice p/ o SLA afiado ("precisa responder") — busca conversas por
-- leadId (in). Sem ele, vira scan filtrado por companyId conforme a ótica cresce.
-- ADITIVA: só cria índice, não toca dados.
CREATE INDEX IF NOT EXISTS "WhatsappConversation_companyId_leadId_idx"
  ON "WhatsappConversation" ("companyId", "leadId");
