-- Re-avaliação de estágio do funil disparada por resposta da ótica (outbound),
-- separada de needsAnalysis (que re-classifica intenção via IA). Aditiva: default
-- false, sem backfill destrutivo. Índice p/ o cron varrer sem table-scan.
ALTER TABLE "WhatsappConversation" ADD COLUMN "needsFunnelEval" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "WhatsappConversation_companyId_needsFunnelEval_idx" ON "WhatsappConversation"("companyId", "needsFunnelEval");
