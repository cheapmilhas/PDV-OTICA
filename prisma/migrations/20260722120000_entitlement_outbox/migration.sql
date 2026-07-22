-- Cadeado Fase 2 — Outbox duravel de publish de entitlement por-company.
--
-- Estende o trigger EXISTENTE (20260719140000): a funcao bump_entitlement_revision
-- ja roda em todo AFTER de Subscription/Company (FOR EACH ROW, filtrada por WHEN
-- nos campos publicaveis). Aqui ela passa a gravar tambem numa linha de outbox
-- por-company (coalescente). Um worker drena e chama o publisher (recalcula fresco
-- o estado comitado). NAO cria trigger novo — os triggers existentes ja chamam a
-- funcao e herdam a mudanca.
--
-- Token de versao = seq (bigint) da MESMA sequence da revisao (nao timestamp:
-- now() e constante-por-tx, colide, e trunca micro->ms entre PG e Prisma). Um
-- unico nextval alimenta revisao E outbox, mantendo-os alinhados.
--
-- Aplicar SO com `prisma migrate deploy` (NUNCA migrate dev/db push — .env=prod;
-- licao do incidente 17/07 que zerou o banco). DDL via DIRECT_URL (migrate deploy
-- ja usa directUrl).
--
-- ROLE RUNTIME resolvida (gate 2.0, 2026-07-22): `neondb_owner`, que e TAMBEM o
-- owner de Company/Subscription/EntitlementRevision (padrao Neon single-owner).
-- Como o runtime E o owner, ele ja pode INSERT/UPDATE/DELETE/SELECT na tabela nova
-- e ja tem USAGE na sequence (criou na V3a). Os GRANTs abaixo sao DEFESA idempotente
-- (redundantes com single-owner, inofensivos). O maior risco da spec (toda escrita
-- de Company/Subscription falhar no trigger por falta de grant) NAO se materializa.
--
-- PREFLIGHT antes do deploy: lock_timeout curto + checar tx longas em Company (o
-- CREATE TABLE com FK pra Company adquire lock na Company; enfileira atras de tx
-- longa). CREATE OR REPLACE FUNCTION nao trava as tabelas-fonte.

-- Tabela outbox por-company. PK=companyId (coalescente). seq=token opaco de versao.
CREATE TABLE IF NOT EXISTS "EntitlementOutbox" (
  "companyId" TEXT NOT NULL,
  "seq"       BIGINT NOT NULL,
  CONSTRAINT "EntitlementOutbox_pkey" PRIMARY KEY ("companyId"),
  CONSTRAINT "EntitlementOutbox_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Grants defensivos (idempotentes; redundantes com single-owner neondb_owner).
GRANT SELECT, INSERT, UPDATE, DELETE ON "EntitlementOutbox" TO "neondb_owner";
GRANT USAGE ON SEQUENCE "entitlement_revision_seq" TO "neondb_owner";

-- Funcao estendida: um unico nextval alimenta revisao E outbox (alinhados).
-- Semanticamente equivalente ao original para a MONOTONICIDADE (cada chamada
-- consome >=1 valor e a revisao sempre cresce; consumidores dependem so da ORDEM,
-- nao do valor absoluto — vis-entitlement-sync do Domus ordena por <=).
CREATE OR REPLACE FUNCTION "bump_entitlement_revision"(target_company_id TEXT)
RETURNS void AS $$
DECLARE
  new_seq BIGINT;
BEGIN
  IF target_company_id IS NULL THEN
    RETURN;
  END IF;
  new_seq := nextval('entitlement_revision_seq');
  -- relogio monotonico (comportamento inalterado; so a fonte do valor mudou)
  INSERT INTO "EntitlementRevision" ("companyId", "revision")
  VALUES (target_company_id, new_seq)
  ON CONFLICT ("companyId")
  DO UPDATE SET "revision" = new_seq;
  -- NOVO: enqueue no outbox de publish (coalescente por company; token = seq)
  INSERT INTO "EntitlementOutbox" ("companyId", "seq")
  VALUES (target_company_id, new_seq)
  ON CONFLICT ("companyId")
  DO UPDATE SET "seq" = new_seq;
END;
$$ LANGUAGE plpgsql;
