-- Fase A — Fundação do endurecimento da saga de troca de plano (pré-condição do
-- self-service). SÓ dados/schema, sem lógica. Resolve os P0 do Codex ao nível de
-- persistência; a lógica (applyLocal atômico, CAS, lease, worker) vem nas fases
-- B-E. NADA disso tem efeito enquanto o kill-switch VIS_TIER_SELF_SERVICE_ENABLED
-- está OFF (nenhuma op real é criada). Aditiva e idempotente.
--
-- Aplicar SÓ com `prisma migrate deploy` (nunca migrate dev/db push — .env=prod).

-- 3 estados terminais que separam "falha segura" de "cliente cobrado sem plano"
-- (P0 #4). ADD VALUE IF NOT EXISTS é idempotente (PG 12+). NÃO removemos FAILED
-- (compat), mas FAILED passa a ser tratado como terminal humano no código (sem
-- checkpoint recuperável, retomar às cegas é inseguro — achado Codex).
-- decideSagaAction trata estes como manual_review (não "resume").
ALTER TYPE "DomusPlanChangeOpState" ADD VALUE IF NOT EXISTS 'CHARGED_NOT_APPLIED';
ALTER TYPE "DomusPlanChangeOpState" ADD VALUE IF NOT EXISTS 'MANUAL_REVIEW';
ALTER TYPE "DomusPlanChangeOpState" ADD VALUE IF NOT EXISTS 'FAILED_BEFORE_BILLING';

-- Identidade da assinatura PERSISTIDA na op (P0 #3): fixada antes de cobrar, para
-- que confirmBilling E applyLocal ajam na MESMA assinatura — nunca cobrar X e
-- aplicar Y, nem "não achar" se a subscription mudou de status. Nullable: ops
-- antigas não têm; a fase B preenche no fresh antes de BILLING_REQUESTED.
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "asaasSubscriptionId" TEXT;
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "priceApplied" INTEGER;
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "billingCycle" "BillingCycle";

-- Controle de tentativas + backoff (P0: sem attempts hoje → retry eterno de falha
-- determinística). nextAttemptAt permite backoff sem heartbeat frágil.
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);

-- Lease/claim compartilhado endpoint×worker (P0 #2): fencing token + validade.
-- Uma transição só vale com o leaseToken vigente → dois executores não pisam um
-- no outro nem regridem estado.
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "leaseToken" TEXT;
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "leaseUntil" TIMESTAMP(3);

-- Timestamps financeiros (auditoria/reconciliação): quando pediu/confirmou a
-- cobrança. asaasRef passa a guardar a resposta real do Asaas (fase B), não só a
-- chave — mas a coluna já existe, aqui só documentamos.
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "billingRequestedAt" TIMESTAMP(3);
ALTER TABLE "DomusPlanChangeOp" ADD COLUMN IF NOT EXISTS "billingConfirmedAt" TIMESTAMP(3);

-- Índice do polling do worker (fase E): pega não-terminais elegíveis por tempo.
-- Parcial listando os estados RETOMÁVEIS por INCLUSÃO (não por negação dos
-- terminais) — de propósito: o Postgres PROÍBE referenciar um valor de enum
-- recém-adicionado (CHARGED_NOT_APPLIED etc.) na MESMA transação do ADD VALUE
-- ("unsafe use of new value"), e migrate deploy roda o arquivo em 1 tx. Os 4
-- estados abaixo já existiam antes desta migração → seguro.
CREATE INDEX IF NOT EXISTS "DomusPlanChangeOp_retry_idx"
  ON "DomusPlanChangeOp" ("nextAttemptAt", "leaseUntil")
  WHERE "state" IN ('RECEIVED', 'BILLING_REQUESTED', 'BILLING_CONFIRMED', 'LOCAL_APPLIED');
