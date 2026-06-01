-- M8 (auditoria dogfood): generateReminders usava createMany com
-- skipDuplicates, mas CustomerReminder não tinha constraint única — então
-- skipDuplicates era no-op e 2 execuções concorrentes do cron criavam
-- lembretes duplicados. Este índice único PARCIAL garante no banco que só há 1
-- lembrete ATIVO por (empresa, cliente, segmento), tornando skipDuplicates
-- efetivo e fechando a corrida.

-- Desduplica lembretes ativos pré-existentes (mantém o mais recente por
-- generatedAt; cancela os demais para liberar a chave). Sem isso o CREATE
-- UNIQUE INDEX abaixo falharia.
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "companyId", "customerId", "segment"
      ORDER BY "generatedAt" DESC, "id" DESC
    ) AS rn
  FROM "customer_reminders"
  WHERE "status" IN ('PENDING', 'IN_PROGRESS', 'SCHEDULED')
)
UPDATE "customer_reminders" cr
SET "status" = 'CANCELLED'
FROM ranked r
WHERE cr."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX "customer_reminders_active_unique"
  ON "customer_reminders" ("companyId", "customerId", "segment")
  WHERE "status" IN ('PENDING', 'IN_PROGRESS', 'SCHEDULED');
