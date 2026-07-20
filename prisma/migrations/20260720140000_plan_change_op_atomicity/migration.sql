-- Fase B — Atomicidade da saga de troca de plano (o coração). Duas travas de
-- banco que complementam o CAS de estado (feito no código, executor/deps):
--
--   1. planChangeOpId único em subscription_history e GlobalAudit → mesmo que o
--      CAS falhe por um bug, o banco recusa a 2ª linha de history/audit da mesma
--      op (P2002). Cinto + suspensório contra applyLocal reexecutado num crash.
--
--   2. Máx 1 op NÃO-TERMINAL por company em DomusPlanChangeOp → mata o A→B→A
--      CROSS-OP (achado Codex): o CAS por op.id serializa reexecuções da MESMA
--      op, mas NÃO impede duas ops DIFERENTES da mesma clínica intercalarem
--      (Asaas em B, Vis em A). Com esta trava, a 2ª troca com a 1ª ainda em voo
--      pega P2002 no create → o endpoint responde 409 (troca em andamento). O
--      Domus já garante 1 PENDING/clínica no outbox (D1.3) → casa dos dois lados.
--
-- Aditiva e idempotente. NADA tem efeito enquanto VIS_TIER_SELF_SERVICE_ENABLED
-- está OFF (nenhuma op real é criada; a tabela tem 0 linhas). Aplicar SÓ com
-- `prisma migrate deploy` (nunca migrate dev/db push — .env aponta pra prod).

-- (1) Trava anti-duplicata em history/audit ------------------------------------
-- Coluna nullable: as milhares de linhas legadas ficam NULL. O índice é PARCIAL
-- (WHERE NOT NULL) — não indexa o legado, e um UNIQUE nullable comum já aceitaria
-- vários NULL, mas o parcial é mais barato e explícito na intenção.
ALTER TABLE "subscription_history" ADD COLUMN IF NOT EXISTS "planChangeOpId" TEXT;
ALTER TABLE "GlobalAudit" ADD COLUMN IF NOT EXISTS "planChangeOpId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_history_planChangeOpId_uq"
  ON "subscription_history" ("planChangeOpId")
  WHERE "planChangeOpId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "GlobalAudit_planChangeOpId_uq"
  ON "GlobalAudit" ("planChangeOpId")
  WHERE "planChangeOpId" IS NOT NULL;

-- (2) Máx 1 op BLOQUEANTE por company ------------------------------------------
-- Inclui os 4 estados retomáveis MAIS os 2 incidentes financeiros humanos
-- (CHARGED_NOT_APPLIED, MANUAL_REVIEW): enquanto há uma op em incidente NÃO
-- resolvido, a company NÃO pode abrir nova troca de plano (achado Codex #7 —
-- senão o cliente cobrado-sem-plano manda outro eventId e mexe no Asaas de novo
-- antes da resolução humana). A resolução (Fase D) move a op para FAILED/
-- COMPLETED (fora do índice), reabrindo a company. FAILED_BEFORE_BILLING fica de
-- FORA (falha segura, nada cobrado → não deve prender a company).
--
-- CHARGED_NOT_APPLIED e MANUAL_REVIEW foram adicionados ao enum na Fase A
-- (migração anterior, tx separada) → seguro referenciá-los aqui.
CREATE UNIQUE INDEX IF NOT EXISTS "DomusPlanChangeOp_active_company_uq"
  ON "DomusPlanChangeOp" ("visCompanyId")
  WHERE "state" IN (
    'RECEIVED', 'BILLING_REQUESTED', 'BILLING_CONFIRMED', 'LOCAL_APPLIED',
    'CHARGED_NOT_APPLIED', 'MANUAL_REVIEW'
  );
