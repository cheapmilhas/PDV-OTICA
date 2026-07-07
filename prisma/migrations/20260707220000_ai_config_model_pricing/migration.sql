-- Central de IA (Fase 4b): overrides de preço por modelo, editáveis pela Config.
-- JSON nullable → sem override, o motor usa a tabela hardcoded de ai-pricing.ts
-- (comportamento idêntico ao atual). Só afeta o custo de linhas de uso FUTURAS;
-- o custo de cada AiTokenUsage já é congelado no momento da escrita, então o
-- histórico NÃO muda retroativamente.
ALTER TABLE "AiGlobalConfig" ADD COLUMN "modelPricingJson" JSONB;
