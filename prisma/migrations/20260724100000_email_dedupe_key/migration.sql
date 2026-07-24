-- F2 Bloco 2 / P0#4: deduplicação de e-mail na EmailQueue.
-- Garante NO MÁXIMO 1 e-mail por evento lógico (ex.: "medical-invite:<companyId>")
-- mesmo com workers/fast-path concorrentes enfileirando. Índice UNIQUE normal:
-- no Postgres cada NULL é distinto, então os e-mails legados (dedupeKey NULL)
-- não colidem entre si. Casa com @unique do schema Prisma (upsert por dedupeKey).
ALTER TABLE "email_queue" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "email_queue_dedupeKey_key"
  ON "email_queue" ("dedupeKey");
