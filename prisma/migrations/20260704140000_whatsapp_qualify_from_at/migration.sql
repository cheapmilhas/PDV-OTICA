-- Corte "qualificar só daqui pra frente": o cron de qualificação por IA ignora
-- conversas com lastMessageAt < qualifyFromAt (backlog), poupando cota mensal.
-- null = sem corte (comportamento original). Setado por botão no admin.
ALTER TABLE "WhatsappConnection" ADD COLUMN "qualifyFromAt" TIMESTAMP(3);
