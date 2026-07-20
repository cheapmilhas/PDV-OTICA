-- V3a — Relogio monotonico por company (EntitlementRevision).
--
-- O relogio atual do publisher e MAX(Subscription.updatedAt, Company.updatedAt),
-- que NAO e estritamente ordenavel (colisao mesmo-ms + torn read). O Domus (D1.2,
-- receiver-first) ja aceita um sourceRevision monotonico. Esta migracao da ao Vis
-- esse relogio SEM depender de incrementar manualmente em ~26 writers: um TRIGGER
-- de banco captura toda mudanca publicavel de Company/Subscription.
--
-- Design (sintese Codex): relogio em TABELA DEDICADA (nao coluna em Company) para
--  - evitar recursao com Company.updatedAt @updatedAt;
--  - evitar churn quando campos nao-publicaveis mudam (ex.: healthScore);
--  - serializar a geracao da revisao por company numa unica linha.
--
-- NAO altera o payload nem o gating: V3a e so o relogio. O publisher so passa a
-- LER a revisao na V3c. Deploy isolado e seguro (sem efeito observavel).
--
-- Aplicar SO com `prisma migrate deploy` (nunca migrate dev/db push -- .env=prod).
-- DDL via DIRECT_URL (nao pooled) -- migrate deploy ja usa directUrl.
--
-- PREFLIGHT antes do deploy (achados Codex):
--  1. Permissoes: as funcoes sao SECURITY INVOKER -> a role RUNTIME (DATABASE_URL)
--     que altera Company/Subscription precisa de INSERT/UPDATE em
--     EntitlementRevision + USAGE na sequence. Se DATABASE_URL e DIRECT_URL usam
--     o MESMO owner (padrao Neon), OK. Se o runtime usa role restrita diferente,
--     conceder grants ANTES (senao toda escrita de Company/Subscription falha).
--  2. lock_timeout curto + checar transacoes longas antes (CREATE TRIGGER pega
--     SHARE ROW EXCLUSIVE nas tabelas-fonte; enfileira atras de tx longa).
--  3. Deadlock 40P01 possivel em writer multi-company (A->B vs B->A) -- nenhum
--     writer atual obvio; se surgir, ordem deterministica + retry (divida).

-- Sequence global: fonte da monotonicidade. bigint (nao cicla na pratica).
CREATE SEQUENCE IF NOT EXISTS "entitlement_revision_seq" AS bigint;

-- Relogio por company. revision = ultimo nextval atribuido a esta company.
CREATE TABLE IF NOT EXISTS "EntitlementRevision" (
  "companyId" TEXT NOT NULL,
  "revision"  BIGINT NOT NULL,
  CONSTRAINT "EntitlementRevision_pkey" PRIMARY KEY ("companyId"),
  CONSTRAINT "EntitlementRevision_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Funcao do trigger: bump da revisao de UMA company. Upsert porque a linha pode
-- nao existir ainda (company nova). SECURITY DEFINER nao e necessario.
CREATE OR REPLACE FUNCTION "bump_entitlement_revision"(target_company_id TEXT)
RETURNS void AS $$
BEGIN
  IF target_company_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO "EntitlementRevision" ("companyId", "revision")
  VALUES (target_company_id, nextval('entitlement_revision_seq'))
  ON CONFLICT ("companyId")
  DO UPDATE SET "revision" = nextval('entitlement_revision_seq');
END;
$$ LANGUAGE plpgsql;

-- Trigger de Subscription: INSERT, DELETE, UPDATE (dos campos publicaveis) e
-- UPDATE OF companyId (bump da company antiga E da nova).
CREATE OR REPLACE FUNCTION "trg_subscription_entitlement_revision"()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM "bump_entitlement_revision"(OLD."companyId");
    RETURN OLD;
  END IF;
  IF (TG_OP = 'INSERT') THEN
    PERFORM "bump_entitlement_revision"(NEW."companyId");
    RETURN NEW;
  END IF;
  -- UPDATE: se a company mudou, bump das duas; senao, bump da company atual.
  IF (NEW."companyId" IS DISTINCT FROM OLD."companyId") THEN
    PERFORM "bump_entitlement_revision"(OLD."companyId");
  END IF;
  PERFORM "bump_entitlement_revision"(NEW."companyId");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Filtro de campos publicaveis no UPDATE (WHEN): so bump quando muda algo que o
-- entitlement enxerga. Evita churn de updates irrelevantes (ex.: metricas).
-- DROP IF EXISTS antes de cada CREATE: torna a migracao retry-safe (achado Codex).
-- CREATE TRIGGER nao suporta IF NOT EXISTS; sem o DROP, um retry apos falha
-- parcial (migrate deploy nao envolve o arquivo em 1 tx) falharia com "already
-- exists" e travaria os proximos deploys.
DROP TRIGGER IF EXISTS "subscription_entitlement_revision_ins" ON "Subscription";
CREATE TRIGGER "subscription_entitlement_revision_ins"
  AFTER INSERT ON "Subscription"
  FOR EACH ROW EXECUTE FUNCTION "trg_subscription_entitlement_revision"();
DROP TRIGGER IF EXISTS "subscription_entitlement_revision_del" ON "Subscription";
CREATE TRIGGER "subscription_entitlement_revision_del"
  AFTER DELETE ON "Subscription"
  FOR EACH ROW EXECUTE FUNCTION "trg_subscription_entitlement_revision"();
DROP TRIGGER IF EXISTS "subscription_entitlement_revision_upd" ON "Subscription";
CREATE TRIGGER "subscription_entitlement_revision_upd"
  AFTER UPDATE ON "Subscription"
  FOR EACH ROW
  WHEN (
    NEW."companyId"        IS DISTINCT FROM OLD."companyId"        OR
    NEW."status"           IS DISTINCT FROM OLD."status"           OR
    NEW."planId"           IS DISTINCT FROM OLD."planId"           OR
    NEW."trialEndsAt"      IS DISTINCT FROM OLD."trialEndsAt"      OR
    NEW."pastDueSince"     IS DISTINCT FROM OLD."pastDueSince"     OR
    NEW."currentPeriodEnd" IS DISTINCT FROM OLD."currentPeriodEnd"
  )
  EXECUTE FUNCTION "trg_subscription_entitlement_revision"();

-- Trigger de Company: INSERT e UPDATE dos campos publicaveis (isBlocked,
-- accessEnabled, platformProduct, domusClinicId). NAO todo update (healthScore
-- muda muito e nao afeta entitlement).
CREATE OR REPLACE FUNCTION "trg_company_entitlement_revision"()
RETURNS trigger AS $$
BEGIN
  PERFORM "bump_entitlement_revision"(NEW."id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "company_entitlement_revision_ins" ON "Company";
CREATE TRIGGER "company_entitlement_revision_ins"
  AFTER INSERT ON "Company"
  FOR EACH ROW EXECUTE FUNCTION "trg_company_entitlement_revision"();
DROP TRIGGER IF EXISTS "company_entitlement_revision_upd" ON "Company";
CREATE TRIGGER "company_entitlement_revision_upd"
  AFTER UPDATE ON "Company"
  FOR EACH ROW
  WHEN (
    NEW."isBlocked"       IS DISTINCT FROM OLD."isBlocked"       OR
    NEW."accessEnabled"   IS DISTINCT FROM OLD."accessEnabled"   OR
    NEW."platformProduct" IS DISTINCT FROM OLD."platformProduct" OR
    NEW."domusClinicId"   IS DISTINCT FROM OLD."domusClinicId"
  )
  EXECUTE FUNCTION "trg_company_entitlement_revision"();

-- Backfill: toda company existente ganha uma revisao inicial. Sem isto, uma
-- company que nunca mais muda ficaria sem linha e o publisher nao teria revision.
-- Cada uma pega um nextval distinto (ordem por createdAt para estabilidade).
INSERT INTO "EntitlementRevision" ("companyId", "revision")
SELECT "id", nextval('entitlement_revision_seq')
FROM "Company"
ORDER BY "createdAt" ASC
ON CONFLICT ("companyId") DO NOTHING;
