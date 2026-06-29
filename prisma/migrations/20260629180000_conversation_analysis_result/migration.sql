-- Inbox: persistir o RESULTADO da análise da IA na conversa (vire lead ou não),
-- p/ o dono ver no inbox o motivo/intenção/tipo de cliente — antes o motivo era
-- descartado quando não virava lead. ADITIVA: 4 colunas nullable, zero impacto.

ALTER TABLE "WhatsappConversation" ADD COLUMN IF NOT EXISTS "analysisIsLead" BOOLEAN;
ALTER TABLE "WhatsappConversation" ADD COLUMN IF NOT EXISTS "analysisIntent" TEXT;
ALTER TABLE "WhatsappConversation" ADD COLUMN IF NOT EXISTS "analysisCustomerKind" TEXT;
ALTER TABLE "WhatsappConversation" ADD COLUMN IF NOT EXISTS "analysisReason" TEXT;
