-- Cadeado Fase 3 — Revogacao de entitlement orfao (P0-B).
-- Quando o vinculo clinica<->company some/muda, o clinicId ANTIGO tem de ser
-- revogado no Domus (writeAllowed:false). O outbox por-company (F2) nao faz isso
-- (so republica o estado da company ATUAL). Tabela chaveada por domusClinicId, SEM
-- FK pra Company (sobrevive ao delete da company). Guarda visCompanyId (OLD.id, o
-- Domus exige visCompanyId nao-vazio no validateSnapshot) + reason
-- (COMPANY_DELETED terminal | UNLINKED TTL — o Domus ja implementa as 2 semanticas
-- em computeDenyVerifiedUntil, gate 3.0 satisfeito, zero mudanca no Domus).
--
-- MONOTONICIDADE (mesma licao P0 da F2, achado Codex): nextval SO no INSERT/VALUES
-- e no DO UPDATE (apos o lock de linha); RETURNING captura o valor gravado. Reusa
-- entitlement_revision_seq (mesmo relogio — o Domus ordena revogacao e publish pela
-- MESMA sequence, coerencia entre os dois canais).
--
-- Aplicar SO com `prisma migrate deploy` (NUNCA migrate dev/db push — .env=prod;
-- licao do incidente 17/07). ROLE = neondb_owner (gate 2.0, single-owner).
--
-- PREFLIGHT: os triggers novos AFTER UPDATE/DELETE em Company pegam
-- SHARE ROW EXCLUSIVE em Company ao criar — lock_timeout curto + checar tx longa.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "EntitlementRevocationOutbox" (
  "domusClinicId" TEXT NOT NULL,
  "visCompanyId"  TEXT NOT NULL,
  "reason"        TEXT NOT NULL,
  "seq"           BIGINT NOT NULL,
  CONSTRAINT "EntitlementRevocationOutbox_pkey" PRIMARY KEY ("domusClinicId"),
  -- Endurecimento (Codex): so os 2 reasons validos; um reason inesperado viraria
  -- TTL no Domus (fail-open) — o CHECK rejeita no banco (fail-closed).
  CONSTRAINT "EntitlementRevocationOutbox_reason_check"
    CHECK ("reason" IN ('COMPANY_DELETED', 'UNLINKED'))
);

-- Grants defensivos (idempotentes; redundantes com single-owner neondb_owner).
GRANT SELECT, INSERT, UPDATE, DELETE ON "EntitlementRevocationOutbox" TO "neondb_owner";
GRANT USAGE ON SEQUENCE "entitlement_revision_seq" TO "neondb_owner";

-- enqueue de revogacao (coalescente por clinicId). nextval DENTRO do upsert
-- (INSERT no VALUES; conflito no DO UPDATE apos o lock de linha) — RETURNING
-- garante que o outbox fica com o valor efetivamente gravado (monotonico).
CREATE OR REPLACE FUNCTION "enqueue_entitlement_revocation"(
  target_clinic_id TEXT, source_company_id TEXT, revoke_reason TEXT
)
RETURNS void AS $$
DECLARE
  effective_seq BIGINT;
BEGIN
  IF target_clinic_id IS NULL THEN RETURN; END IF;
  INSERT INTO "EntitlementRevocationOutbox" ("domusClinicId", "visCompanyId", "reason", "seq")
  VALUES (target_clinic_id, source_company_id, revoke_reason, nextval('entitlement_revision_seq'))
  ON CONFLICT ("domusClinicId")
  DO UPDATE SET
    "visCompanyId" = EXCLUDED."visCompanyId",
    "reason"       = EXCLUDED."reason",
    "seq"          = nextval('entitlement_revision_seq')
  RETURNING "seq" INTO effective_seq;
  -- effective_seq capturado apenas para forcar a materializacao do nextval no
  -- ramo correto (INSERT ou UPDATE); o valor ja esta gravado na linha.
END;
$$ LANGUAGE plpgsql;

-- UPDATE de Company: escolhe o reason por cenario.
--  - VIS_MEDICAL -> outro produto (com clinicId): COMPANY_DELETED (terminal).
--  - domusClinicId A->B (troca) ou A->NULL, seguindo medical: UNLINKED (TTL, reversivel).
-- Se AMBOS mudam no mesmo update, o terminal (deixar de ser medical) vence.
CREATE OR REPLACE FUNCTION "trg_company_revocation"()
RETURNS trigger AS $$
BEGIN
  IF OLD."domusClinicId" IS NULL THEN
    RETURN NEW;
  END IF;
  -- domusClinicId e UUID no banco; a funcao recebe TEXT → cast explicito ::text
  -- (P0 achado Codex: sem o cast, o Postgres nao resolve a funcao e o trigger
  -- AFTER falha, REVERTENDO a escrita da Company).
  IF OLD."platformProduct" = 'VIS_MEDICAL' AND NEW."platformProduct" IS DISTINCT FROM 'VIS_MEDICAL' THEN
    -- deixou de ser medical: terminal
    PERFORM "enqueue_entitlement_revocation"(OLD."domusClinicId"::text, OLD."id", 'COMPANY_DELETED');
  ELSIF NEW."platformProduct" = 'VIS_MEDICAL'
        AND NEW."domusClinicId" IS DISTINCT FROM OLD."domusClinicId" THEN
    -- trocou/perdeu o vinculo E SEGUE medical: reversivel (P1 achado Codex — o guard
    -- NEW=VIS_MEDICAL impede que uma limpeza VIS_APP/A→VIS_APP/NULL rebaixe um
    -- COMPANY_DELETED terminal ja emitido para UNLINKED/TTL).
    PERFORM "enqueue_entitlement_revocation"(OLD."domusClinicId"::text, OLD."id", 'UNLINKED');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "company_revocation_upd" ON "Company";
CREATE TRIGGER "company_revocation_upd"
  AFTER UPDATE ON "Company"
  FOR EACH ROW
  WHEN (
    NEW."domusClinicId"   IS DISTINCT FROM OLD."domusClinicId" OR
    NEW."platformProduct" IS DISTINCT FROM OLD."platformProduct"
  )
  EXECUTE FUNCTION "trg_company_revocation"();

-- DELETE de Company: terminal se era medical vinculada.
CREATE OR REPLACE FUNCTION "trg_company_revocation_del"()
RETURNS trigger AS $$
BEGIN
  IF OLD."platformProduct" = 'VIS_MEDICAL' AND OLD."domusClinicId" IS NOT NULL THEN
    -- ::text: domusClinicId e UUID, a funcao recebe TEXT (P0 achado Codex)
    PERFORM "enqueue_entitlement_revocation"(OLD."domusClinicId"::text, OLD."id", 'COMPANY_DELETED');
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "company_revocation_del" ON "Company";
CREATE TRIGGER "company_revocation_del"
  AFTER DELETE ON "Company"
  FOR EACH ROW EXECUTE FUNCTION "trg_company_revocation_del"();
