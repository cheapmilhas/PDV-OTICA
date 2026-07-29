-- Plano B — motor de recorrencia: obrigacoes, cortesias e sombra.
--
-- ESTRITAMENTE ADITIVA e IDEMPOTENTE. Nenhum ALTER destrutivo, nenhum NOT NULL
-- novo em tabela existente, nenhum UPDATE em linha viva.
--
-- ⚠️ TUDO DENTRO DE UMA TRANSACAO (BEGIN no fim deste cabecalho, COMMIT no fim
-- do arquivo). No Postgres o DDL e transacional — CREATE TABLE, CREATE INDEX,
-- CREATE TRIGGER, CREATE TYPE e ALTER TABLE ADD COLUMN todos revertem. Sem o
-- envelope, ~30 statements independentes atravessariam o PgBouncer (o `.env`
-- deste repo tem DATABASE_URL e DIRECT_URL IDENTICAS, ambas no endpoint
-- `-pooler`) e uma falha no meio deixaria o banco com AS TABELAS CRIADAS E OS
-- TRIGGERS NAO — que e precisamente a violacao silenciosa de I2 que esta
-- migracao existe para impedir. Ou tudo entra, ou nada entra.
--
-- Nenhum statement precisou ficar FORA da transacao: nao ha CREATE INDEX
-- CONCURRENTLY, VACUUM, nem ALTER TYPE ... ADD VALUE (o unico DDL de enum aqui
-- e CREATE TYPE, que e transacional). As tabelas nascem vazias, entao indice
-- normal nao trava ninguem; e as duas colunas novas em tabelas existentes sao
-- nullable, ou seja, ADD COLUMN sem reescrita de heap.
--
-- REVERSAO — leia antes de apertar o botao. Os OBJETOS NOVOS saem por DROP
-- (as 3 tabelas, os 2 tipos, os 6 triggers, as 2 funcoes, a coluna
-- Invoice."billingObligationId"): nada depende deles enquanto o motor estiver
-- desligado por env var.
--
-- ⚠️ A coluna dunning_events."stage" NAO e reversivel sozinha. O codigo ja
-- deployado escreve nela (`recordDunningNotice`) e a consulta
-- (`hasDispatchedNotice`, que roda no gate de ~15 rotas de escrita). Remove-la
-- com o codigo novo no ar QUEBRA ESSE GATE EM RUNTIME. A ordem correta e:
--   1) reverter o codigo (voltar dunning-event.service.ts a versao do Plano A);
--   2) so entao remover a coluna.
-- E mesmo nessa ordem ha PERDA DE DADO: as linhas gravadas depois desta
-- migracao carregam o marco (3/7/14) apenas na coluna `stage`, e a informacao
-- de qual marco foi avisado some junto — os marcos 3 e 7 voltam a ser
-- indistinguiveis. Na pratica: preferir DESLIGAR o motor por env var a reverter
-- a migracao.
--
-- ANTES DE APLICAR, rode o dry-run (aplica tudo numa transacao e reverte, sem
-- deixar rastro):
--   node scripts/dry-run-migration.cjs prisma/migrations/20260729180000_billing_obligations/migration.sql
--
-- Aplicar SO pelo script cirurgico `scripts/apply-billing-obligations.cjs`
-- (o `.env` local aponta para PRODUCAO; este repo ja teve um incidente de banco
-- zerado). NUNCA `prisma migrate dev` nem `prisma db push`.
--
-- Conteudo:
--   1. Enums ObligationDisposition e ObligationState (dois eixos ORTOGONAIS)
--   2. Tabela billing_obligations
--   3. Tabela subscription_courtesies
--   4. Tabela billing_shadow_decisions (descartavel)
--   5. Invoice."billingObligationId" (coluna nullable + FK + indice)
--   6. Dividas de dunning_events: coluna stage, unique, indice de leitura,
--      e declaracao dos 3 indices que existem fisicamente desde 2026-03
--   7. Triggers de revisao de entitlement (I2) nas duas tabelas contabeis
--
-- FLAGS DO ROLLOUT: NAO estao aqui. As quatro chaves (§7 da spec) sao ENV VARS,
-- em `src/lib/billing-engine-flags.ts`:
--   BILLING_OBLIGATION_ENABLED | BILLING_SHADOW_ENABLED |
--   BILLING_ISSUE_ENABLED + BILLING_ISSUE_COMPANY_IDS |
--   BILLING_ENFORCEMENT_ENABLED + BILLING_ENFORCEMENT_COMPANY_IDS
-- Motivo: acrescentar booleanos a SaasEmailConfig repetiria o erro de
-- `invoiceGenerationEnabled` — ligar o faturamento do SaaS numa tela de e-mail.
-- Precedente do repo: ENFORCE_SUSPENSION / SUBSCRIPTION_BYPASS_COMPANY_IDS.

-- ===========================================================================
-- INICIO DA TRANSACAO. O COMMIT esta na ultima linha do arquivo. Se qualquer
-- statement abaixo falhar, NADA e aplicado.
-- ===========================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enums. Padrao DO $$ do projeto (idempotente: CREATE TYPE nao tem
--    IF NOT EXISTS). Enum NATIVO, e nao TEXT com CHECK, porque e o padrao
--    dominante deste schema (94 enums) — misturar estilos criaria drift.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ObligationDisposition') THEN
    -- LEGACY_WAIVED ja nasce no enum: e a disposicao do BOOTSTRAP (etapa 2 do
    -- rollout, o passado regularizado). Nenhum codigo TS a produz hoje, mas o
    -- backfill precisa dela. Acrescentar valor a enum depois exige
    -- ALTER TYPE ... ADD VALUE, que tem restricoes em transacao — declarar o
    -- conjunto completo agora evita essa dor.
    CREATE TYPE "ObligationDisposition" AS ENUM ('CHARGE', 'COURTESY', 'INTERNAL', 'LEGACY_WAIVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ObligationState') THEN
    CREATE TYPE "ObligationState" AS ENUM ('PLANNED', 'ISSUED', 'PAID', 'VOID');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. billing_obligations — registro CONTABIL.
--
-- onDelete RESTRICT nas duas FKs (subscription e plan), NAO cascade: apagar uma
-- assinatura que tem obrigacoes emitidas apagaria a evidencia do que foi
-- cobrado. Contabilidade nao some junto com o cadastro; se alguem precisar
-- mesmo apagar a assinatura, que anule (VOID) as obrigacoes antes, de forma
-- consciente e registrada.
--
-- "priceCents" e a MESMA unidade de Plan."priceMonthly" (Int, CENTAVOS).
-- Copia direta na emissao — sem *100 nem /100.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "billing_obligations" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "sequence"       INTEGER NOT NULL,
  "periodStart"    TIMESTAMP(3) NOT NULL,
  "periodEnd"      TIMESTAMP(3) NOT NULL,
  "planId"         TEXT NOT NULL,
  "cycle"          "BillingCycle" NOT NULL,
  "priceCents"     INTEGER NOT NULL,
  "disposition"    "ObligationDisposition" NOT NULL DEFAULT 'CHARGE',
  "state"          "ObligationState" NOT NULL DEFAULT 'PLANNED',
  "voidReason"     TEXT,
  "issuedAt"       TIMESTAMP(3),
  "dueAt"          TIMESTAMP(3),
  "paidAt"         TIMESTAMP(3),
  "invoiceId"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_obligations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_obligations_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "billing_obligations_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Identidade da obrigacao. NAO garante contiguidade (nao impede lacuna nem
-- sobreposicao de datas) — isso e responsabilidade de nextPeriod/isContiguous
-- em src/lib/billing-clock.ts. Garante que duas execucoes concorrentes do motor
-- nao criem a mesma obrigacao duas vezes, que e o furo que os 4 escritores de
-- Invoice tem hoje (a duplicata INV-000003/4 e a prova).
CREATE UNIQUE INDEX IF NOT EXISTS "billing_obligations_subscriptionId_sequence_key"
  ON "billing_obligations" ("subscriptionId", "sequence");
CREATE INDEX IF NOT EXISTS "billing_obligations_subscriptionId_state_idx"
  ON "billing_obligations" ("subscriptionId", "state");
CREATE INDEX IF NOT EXISTS "billing_obligations_periodEnd_idx"
  ON "billing_obligations" ("periodEnd");

-- ---------------------------------------------------------------------------
-- 3. subscription_courtesies — concessao datada e auditavel.
--
-- onDelete CASCADE aqui (e nao RESTRICT como na obrigacao): cortesia e
-- CONCESSAO, nao lancamento contabil. Se a assinatura some, a concessao sobre
-- ela nao tem sujeito nem significado. O que precisa sobreviver e a OBRIGACAO
-- que a cortesia produziu (com disposition=COURTESY e o priceCents da receita
-- nao faturada) — e essa e RESTRICT.
--
-- Compativel por estrutura com CourtesyCandidate (src/lib/billing-courtesy.ts):
-- startsAt NOT NULL, endsAt e revokedAt nullable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "subscription_courtesies" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "startsAt"       TIMESTAMP(3) NOT NULL,
  "endsAt"         TIMESTAMP(3),
  "reason"         TEXT NOT NULL,
  "grantedBy"      TEXT NOT NULL,
  "revokedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_courtesies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_courtesies_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "subscription_courtesies_subscriptionId_startsAt_idx"
  ON "subscription_courtesies" ("subscriptionId", "startsAt");

-- ---------------------------------------------------------------------------
-- 4. billing_shadow_decisions — DESCARTAVEL por natureza.
--
-- Sem FK e sem trigger de propósito: e diagnostico, nao registro. Uma FK faria
-- um artefato que se pode dropar a qualquer momento travar o DELETE de uma
-- empresa; e um trigger de revisao aqui bumparia o entitlement por uma decisao
-- que, por definicao, NAO muda o acesso de ninguem (modo sombra nao emite e nao
-- bloqueia) — puro churn no Domus.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "billing_shadow_decisions" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "runAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "wouldCharge"    BOOLEAN NOT NULL,
  "wouldRestrict"  BOOLEAN NOT NULL,
  "periodStart"    TIMESTAMP(3) NOT NULL,
  "periodEnd"      TIMESTAMP(3) NOT NULL,
  "priceCents"     INTEGER NOT NULL,
  "disposition"    "ObligationDisposition" NOT NULL,
  "note"           TEXT,
  CONSTRAINT "billing_shadow_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "billing_shadow_decisions_runAt_idx"
  ON "billing_shadow_decisions" ("runAt");

-- ---------------------------------------------------------------------------
-- 5. Invoice."billingObligationId" — coluna NULLABLE, aditiva.
--
-- E por aqui que o webhook de pagamento acha a obrigacao a partir da fatura
-- paga. Sem ela, o pagamento confirmaria a fatura e a obrigacao seguiria ISSUED
-- e vencida — restringindo um cliente que PAGOU (violacao direta de I1).
--
-- ON DELETE SET NULL: apagar uma obrigacao (caso raro, so via limpeza
-- deliberada) nao deve apagar a FATURA, que e documento fiscal.
-- Toda linha existente fica NULL. Nenhuma reescrita.
-- ---------------------------------------------------------------------------
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "billingObligationId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_billingObligationId_fkey'
  ) THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_billingObligationId_fkey"
      FOREIGN KEY ("billingObligationId") REFERENCES "billing_obligations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "Invoice_billingObligationId_idx"
  ON "Invoice" ("billingObligationId");

-- ---------------------------------------------------------------------------
-- 6. Dividas de dunning_events que o Plano A adiou "para a fatia que carregar
--    migracao". Esta e a unica migracao dos tres planos, entao vencem aqui.
-- ---------------------------------------------------------------------------

-- 6.1. Coluna "stage": o marco da regua (3, 7, 14...).
-- Sem ela, os marcos 3 e 7 gravam ambos REMINDER_EMAIL e ficam
-- INDISTINGUIVEIS PARA SEMPRE.
ALTER TABLE "dunning_events" ADD COLUMN IF NOT EXISTS "stage" INTEGER;

-- 6.2. Idempotencia da regua. Uma reexecucao do cron no mesmo marco pega
-- violacao de unique em vez de gravar linha duplicada.
--
-- ⚠️ CONSEQUENCIA REGISTRADA: no Postgres cada NULL e DISTINTO num indice
-- unique. As linhas ja gravadas pelo Plano A tem stage NULL e portanto NAO
-- colidem entre si nem com nada — o unique so passa a valer da primeira linha
-- COM stage em diante. Isso e conveniente (a migracao nao falha por duplicata
-- historica, e nao precisamos reescrever passado) mas nao e protecao
-- retroativa: duplicatas legadas continuam existindo e continuam sem marco.
-- Aceito — o alvo e impedir duplicata NOVA.
CREATE UNIQUE INDEX IF NOT EXISTS "dunning_events_invoiceId_action_stage_key"
  ON "dunning_events" ("invoiceId", "action", "stage");

-- 6.3. Indices que cobrem hasDispatchedNotice, a consulta que roda no gate de
-- ~15 rotas de escrita. Sem eles, seq scan em dunning_events a cada requisicao
-- de tenant em atraso.
--
-- Sao DOIS porque a consulta e um OR de dois ramos (ver docblock de
-- hasDispatchedNotice): o ramo LEGADO (stage IS NULL + action, para as linhas
-- gravadas pelo Plano A) e o ramo NOVO (stage exato). O planner do Postgres
-- resolve cada ramo do OR com seu proprio indice (BitmapOr).
CREATE INDEX IF NOT EXISTS "dunning_events_companyId_action_status_idx"
  ON "dunning_events" ("companyId", "action", "status");
CREATE INDEX IF NOT EXISTS "dunning_events_companyId_stage_status_idx"
  ON "dunning_events" ("companyId", "stage", "status");

-- 6.4. Os tres indices abaixo JA EXISTEM fisicamente desde
-- 20260326_sprint1_saas_admin_evolution/migration.sql:233-235 e nunca entraram
-- no modelo Prisma. Foram declarados agora no schema.prisma para acabar com o
-- drift; os CREATE ... IF NOT EXISTS abaixo sao NO-OP em producao e existem so
-- para que um banco recriado do zero (CI, futuro banco de dev) fique igual.
CREATE INDEX IF NOT EXISTS "dunning_events_companyId_createdAt_idx"
  ON "dunning_events" ("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "dunning_events_invoiceId_idx"
  ON "dunning_events" ("invoiceId");
CREATE INDEX IF NOT EXISTS "dunning_events_status_idx"
  ON "dunning_events" ("status");

-- ---------------------------------------------------------------------------
-- 7. TRIGGERS DE REVISAO DE ENTITLEMENT (invariante I2).
--
-- Sem isto, mudar obrigacao ou cortesia altera o ACESSO do cliente sem bumpar a
-- revisao — o publisher mandaria o payload novo com a revisao de ontem, o Domus
-- rejeitaria por revisao nao-crescente, e a clinica seguiria escrevendo
-- prontuario achando-se bloqueada (ou seguiria bloqueada achando-se liberada).
--
-- Estilo copiado de 20260719140000_entitlement_revision/migration.sql:
--   - funcao PERFORM "bump_entitlement_revision"(companyId)
--   - TG_OP tratando DELETE (so OLD), INSERT e UPDATE
--   - DROP TRIGGER IF EXISTS antes de cada CREATE TRIGGER (CREATE TRIGGER nao
--     suporta IF NOT EXISTS; sem o DROP, um retry apos falha parcial trava os
--     proximos deploys, porque migrate deploy NAO envolve o arquivo em 1 tx)
--   - WHEN (...) no UPDATE filtrando so as colunas que mudam o entitlement
--
-- ⚠️ DIFERENCA CRITICA em relacao ao trigger de Subscription: nem
-- billing_obligations nem subscription_courtesies tem "companyId". A funcao
-- precisa RESOLVE-LO via "subscriptionId" — inclusive no DELETE, onde so existe
-- OLD.
-- ---------------------------------------------------------------------------

-- Resolve o companyId de uma assinatura e bumpa a revisao dela.
-- STRICT: se subscription_id for NULL, retorna sem fazer nada (nunca acontece
-- pelas colunas NOT NULL, mas a funcao nao depende disso).
-- Se a assinatura ja nao existe (DELETE em cascata chegando aqui em ordem
-- inesperada), o SELECT devolve NULL e bump_entitlement_revision ja trata NULL
-- com RETURN — nao levanta erro nem trava a transacao do chamador.
CREATE OR REPLACE FUNCTION "bump_entitlement_revision_by_subscription"(subscription_id TEXT)
RETURNS void AS $$
DECLARE
  target_company_id TEXT;
BEGIN
  IF subscription_id IS NULL THEN
    RETURN;
  END IF;
  SELECT "companyId" INTO target_company_id
  FROM "Subscription" WHERE "id" = subscription_id;
  PERFORM "bump_entitlement_revision"(target_company_id);
END;
$$ LANGUAGE plpgsql;

-- Trigger generico das duas tabelas contabeis: usa OLD no DELETE, NEW nos
-- demais, e bumpa AS DUAS companies quando a linha muda de assinatura
-- (reparentagem — hoje nenhum fluxo faz isso, mas o custo de cobrir e zero e o
-- custo de NAO cobrir e um cliente com acesso errado sem revisao nova).
CREATE OR REPLACE FUNCTION "trg_billing_entitlement_revision"()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM "bump_entitlement_revision_by_subscription"(OLD."subscriptionId");
    RETURN OLD;
  END IF;
  IF (TG_OP = 'INSERT') THEN
    PERFORM "bump_entitlement_revision_by_subscription"(NEW."subscriptionId");
    RETURN NEW;
  END IF;
  IF (NEW."subscriptionId" IS DISTINCT FROM OLD."subscriptionId") THEN
    PERFORM "bump_entitlement_revision_by_subscription"(OLD."subscriptionId");
  END IF;
  PERFORM "bump_entitlement_revision_by_subscription"(NEW."subscriptionId");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7.1. billing_obligations.
-- O WHEN do UPDATE lista as colunas que MUDAM A DECISAO DO GATE: estado,
-- disposicao, os carimbos que I1 consulta (issuedAt/dueAt/paidAt), o periodo e
-- a assinatura. Fora da lista ficam priceCents, planId, cycle, voidReason e
-- invoiceId — mudam o que se COBRA, nao se o cliente pode escrever hoje, e
-- incluí-los so geraria churn de publicacao.
DROP TRIGGER IF EXISTS "billing_obligation_entitlement_revision_ins" ON "billing_obligations";
CREATE TRIGGER "billing_obligation_entitlement_revision_ins"
  AFTER INSERT ON "billing_obligations"
  FOR EACH ROW EXECUTE FUNCTION "trg_billing_entitlement_revision"();

DROP TRIGGER IF EXISTS "billing_obligation_entitlement_revision_del" ON "billing_obligations";
CREATE TRIGGER "billing_obligation_entitlement_revision_del"
  AFTER DELETE ON "billing_obligations"
  FOR EACH ROW EXECUTE FUNCTION "trg_billing_entitlement_revision"();

DROP TRIGGER IF EXISTS "billing_obligation_entitlement_revision_upd" ON "billing_obligations";
CREATE TRIGGER "billing_obligation_entitlement_revision_upd"
  AFTER UPDATE ON "billing_obligations"
  FOR EACH ROW
  WHEN (
    NEW."subscriptionId" IS DISTINCT FROM OLD."subscriptionId" OR
    NEW."state"          IS DISTINCT FROM OLD."state"          OR
    NEW."disposition"    IS DISTINCT FROM OLD."disposition"    OR
    NEW."issuedAt"       IS DISTINCT FROM OLD."issuedAt"       OR
    NEW."dueAt"          IS DISTINCT FROM OLD."dueAt"          OR
    NEW."paidAt"         IS DISTINCT FROM OLD."paidAt"         OR
    NEW."periodStart"    IS DISTINCT FROM OLD."periodStart"    OR
    NEW."periodEnd"      IS DISTINCT FROM OLD."periodEnd"
  )
  EXECUTE FUNCTION "trg_billing_entitlement_revision"();

-- 7.2. subscription_courtesies.
-- Toda coluna do WHEN muda se o periodo seguinte nasce COURTESY ou CHARGE — ou
-- seja, muda se o cliente vai ficar em dia sem pagar. reason/grantedBy ficam de
-- fora: corrigir um texto de motivo nao pode custar uma publicacao ao Domus.
DROP TRIGGER IF EXISTS "subscription_courtesy_entitlement_revision_ins" ON "subscription_courtesies";
CREATE TRIGGER "subscription_courtesy_entitlement_revision_ins"
  AFTER INSERT ON "subscription_courtesies"
  FOR EACH ROW EXECUTE FUNCTION "trg_billing_entitlement_revision"();

DROP TRIGGER IF EXISTS "subscription_courtesy_entitlement_revision_del" ON "subscription_courtesies";
CREATE TRIGGER "subscription_courtesy_entitlement_revision_del"
  AFTER DELETE ON "subscription_courtesies"
  FOR EACH ROW EXECUTE FUNCTION "trg_billing_entitlement_revision"();

DROP TRIGGER IF EXISTS "subscription_courtesy_entitlement_revision_upd" ON "subscription_courtesies";
CREATE TRIGGER "subscription_courtesy_entitlement_revision_upd"
  AFTER UPDATE ON "subscription_courtesies"
  FOR EACH ROW
  WHEN (
    NEW."subscriptionId" IS DISTINCT FROM OLD."subscriptionId" OR
    NEW."startsAt"       IS DISTINCT FROM OLD."startsAt"       OR
    NEW."endsAt"         IS DISTINCT FROM OLD."endsAt"         OR
    NEW."revokedAt"      IS DISTINCT FROM OLD."revokedAt"
  )
  EXECUTE FUNCTION "trg_billing_entitlement_revision"();

-- Nenhum backfill. Nenhuma linha existente e tocada. O motor nasce desligado
-- por env var; enquanto BILLING_OBLIGATION_ENABLED nao for "true", as tres
-- tabelas ficam vazias e nada muda para ninguem.

-- ===========================================================================
-- FIM DA TRANSACAO. Ate aqui, nada foi persistido.
-- ===========================================================================
COMMIT;
