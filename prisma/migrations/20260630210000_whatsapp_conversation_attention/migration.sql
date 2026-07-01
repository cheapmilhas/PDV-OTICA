-- Item 1 (guardrail SAGRADO da reclamação): sinal de "precisa de atenção humana"
-- na CONVERSA. Uma reclamação/cobrança é isLead=false → NÃO vira card no funil →
-- sem este sinal o cliente furioso some no "Não-lead" (bug real de prod). ADITIVA:
-- 3 colunas nullable/default + 1 índice; nada toca dados existentes.
--
--  - analysisIntentCode: intenção CRUA (enum) da última análise — o valor MÁQUINA-
--    legível (analysisIntent guarda só o rótulo, artefato de exibição). Sempre sobrescrito.
--  - needsHumanAttention: guardrail. MONOTÔNICO-PRA-CIMA no código (re-qualificação
--    nunca volta p/ false; baixa só por ação humana auditada). Default false.
--  - attentionResolvedAt/ById: trilha de auditoria da baixa humana (quem/quando).

ALTER TABLE "WhatsappConversation"
  ADD COLUMN IF NOT EXISTS "analysisIntentCode"    "ContactIntent",
  ADD COLUMN IF NOT EXISTS "needsHumanAttention"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "attentionResolvedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "attentionResolvedById" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsappConversation_companyId_needsHumanAttention_idx"
  ON "WhatsappConversation" ("companyId", "needsHumanAttention");
