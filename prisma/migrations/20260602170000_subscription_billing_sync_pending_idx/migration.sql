-- F4 (review M): índice para a query da reconciliação
-- (WHERE billingSyncPending = true). Aditivo, idempotente.

CREATE INDEX IF NOT EXISTS "Subscription_billingSyncPending_idx"
  ON "Subscription" ("billingSyncPending");
