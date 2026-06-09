-- BASELINE da tabela `email_queue` e do enum `EmailStatus`.
--
-- Contexto: o model EmailQueue entrou no schema.prisma há tempos (Sprint 8) e a
-- tabela foi materializada no banco de produção via `prisma db push`, ANTES de o
-- projeto adotar migrations versionadas. Por isso nunca houve uma migration de
-- CRIAÇÃO — só uma de ÍNDICES (20260527180000) que já assumia a tabela existindo.
-- Resultado: drift. Um banco recriado do zero via `migrate deploy` NÃO teria a
-- tabela, e o enfileiramento de email no cadastro de cliente (tx.emailQueue.create)
-- quebraria a transação inteira.
--
-- Esta migration é 100% IDEMPOTENTE (IF NOT EXISTS em tudo): no banco atual, onde
-- a tabela/enum já existem, é um no-op; num banco novo, cria a estrutura correta.
-- No banco de produção atual ela é marcada como já-aplicada via
-- `prisma migrate resolve --applied` (não roda o SQL lá).

-- Enum EmailStatus (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailStatus') THEN
    CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
  END IF;
END
$$;

-- Tabela email_queue (idempotente)
CREATE TABLE IF NOT EXISTS "email_queue" (
  "id" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_queue_pkey" PRIMARY KEY ("id")
);

-- Índices (idempotentes). O índice (status, createdAt) já é criado pela migration
-- 20260527180000; repetido aqui com IF NOT EXISTS para que um banco novo, aplicando
-- as migrations em ordem, tenha o índice junto da tabela.
CREATE INDEX IF NOT EXISTS "email_queue_status_idx" ON "email_queue" ("status");
CREATE INDEX IF NOT EXISTS "email_queue_status_createdAt_idx" ON "email_queue" ("status", "createdAt");
