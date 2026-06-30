-- Funil Inteligente — Fatia 3: trilha de auditoria APPEND-ONLY do auto-move da IA.
-- Uma linha por decisão INTERESSANTE do motor (moveu / hold com sinal / erro). O
-- caminho kill-switch-off e sem-sinal NÃO grava (evita amplificação no cron). É o
-- canal de leitura confiável (o cron async não entrega logs) e a base da métrica
-- futura "IA moveu vs humano corrigiu = acurácia". ADITIVA: tabela nova, sem FK,
-- sem backfill, nada toca dados existentes.

CREATE TABLE IF NOT EXISTS "FunnelAutoMoveLog" (
    "id"           TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "leadId"       TEXT NOT NULL,
    "action"       TEXT NOT NULL,
    "moved"        BOOLEAN NOT NULL DEFAULT false,
    "reason"       TEXT NOT NULL,
    "killSwitchOn" BOOLEAN NOT NULL DEFAULT false,
    "intent"       TEXT,
    "confidence"   DOUBLE PRECISION,
    "envSeen"      TEXT,
    "error"        TEXT,
    "at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelAutoMoveLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FunnelAutoMoveLog_companyId_leadId_at_idx"
    ON "FunnelAutoMoveLog" ("companyId", "leadId", "at");

CREATE INDEX IF NOT EXISTS "FunnelAutoMoveLog_companyId_action_at_idx"
    ON "FunnelAutoMoveLog" ("companyId", "action", "at");
