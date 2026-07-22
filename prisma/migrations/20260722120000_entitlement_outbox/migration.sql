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
-- now() e constante-por-tx, colide, e trunca micro->ms entre PG e Prisma).
--
-- 🚨 MONOTONICIDADE (P0 corrigido, achado Codex): o nextval da revisao TEM de ser
-- obtido DENTRO do ON CONFLICT DO UPDATE, nao antes. Motivo: o upsert em
-- EntitlementRevision serializa por LOCK DE LINHA da company; pegar o nextval so
-- APOS o lock garante que quem escreve por ULTIMO tem o maior valor (ordem de
-- commit == ordem de revisao). Se o nextval fosse obtido ANTES do upsert (como numa
-- versao anterior desta migracao), dois triggers concorrentes na mesma company
-- poderiam inverter: T1 pega 10 e pausa; T2 pega 11, grava 11, commita (Domus ve
-- 11); T1 retoma e sobrescreve com 10 → Domus rejeita 10<=11 e fica PERMANENTEMENTE
-- atras. RETURNING ... INTO captura o valor efetivamente gravado (do INSERT ou do
-- UPDATE) e o outbox reusa ESSE valor — revisao e outbox ficam alinhados e monotonicos.
--
-- Aplicar SO com `prisma migrate deploy` (NUNCA migrate dev/db push — .env=prod;
-- licao do incidente 17/07 que zerou o banco). DDL via DIRECT_URL (migrate deploy
-- ja usa directUrl).
--
-- ROLE RUNTIME resolvida (gate 2.0, 2026-07-22): `neondb_owner`, que e TAMBEM o
-- owner de Company/Subscription/EntitlementRevision (padrao Neon single-owner).
-- Como o runtime E o owner, ja tem todos os privilegios; os GRANTs abaixo sao
-- DEFESA idempotente. O maior risco da spec (escrita de Company/Subscription falhar
-- no trigger por falta de grant) NAO se materializa.

-- PREFLIGHT: lock_timeout curto (P1 achado Codex). O CREATE TABLE com FK pra Company
-- adquire ShareRowExclusive na Company; se houver tx longa, o migrate NAO pode
-- represar writers indefinidamente — falha rapido em vez de enfileirar lock.
SET lock_timeout = '5s';

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

-- Funcao estendida: nextval DENTRO do upsert (serializado por lock de linha),
-- valor efetivo capturado por RETURNING INTO, reusado no outbox → alinhados.
CREATE OR REPLACE FUNCTION "bump_entitlement_revision"(target_company_id TEXT)
RETURNS void AS $$
DECLARE
  effective_seq BIGINT;
BEGIN
  IF target_company_id IS NULL THEN
    RETURN;
  END IF;
  -- relogio monotonico: nextval SO no INSERT e no DO UPDATE (apos o lock de linha).
  -- RETURNING captura o valor realmente gravado (INSERT->novo; UPDATE->novo do
  -- DO UPDATE). Preserva a serializacao da funcao original.
  INSERT INTO "EntitlementRevision" ("companyId", "revision")
  VALUES (target_company_id, nextval('entitlement_revision_seq'))
  ON CONFLICT ("companyId")
  DO UPDATE SET "revision" = nextval('entitlement_revision_seq')
  RETURNING "revision" INTO effective_seq;
  -- NOVO: enqueue no outbox de publish (coalescente por company; token = seq).
  -- Reusa o valor JA gravado na revisao → outbox e revisao sempre alinhados.
  INSERT INTO "EntitlementOutbox" ("companyId", "seq")
  VALUES (target_company_id, effective_seq)
  ON CONFLICT ("companyId")
  DO UPDATE SET "seq" = effective_seq;
END;
$$ LANGUAGE plpgsql;

-- Backfill (P2 achado Codex — janela de cutover): sem isto, escritas entre o
-- CREATE TABLE e o CREATE OR REPLACE (ou apos um replace que falhou) rodam a funcao
-- antiga e nao entram no outbox. Enfileira a coorte medical VINCULADA agora, pra o
-- worker publicar o estado atual no 1o tick e o canal nascer completo. So medical
-- vinculada (o resto seria noop). ON CONFLICT: nao rebaixa seq de quem ja tem linha.
-- Usa a revisao ATUAL de cada company (ja monotonica) como seq — nao consome
-- nextval novo (evita disparar o proprio relogio).
INSERT INTO "EntitlementOutbox" ("companyId", "seq")
SELECT er."companyId", er."revision"
FROM "EntitlementRevision" er
JOIN "Company" c ON c."id" = er."companyId"
WHERE c."platformProduct" = 'VIS_MEDICAL' AND c."domusClinicId" IS NOT NULL
ON CONFLICT ("companyId") DO NOTHING;
