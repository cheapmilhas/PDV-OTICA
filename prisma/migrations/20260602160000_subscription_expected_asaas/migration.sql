-- F4: reconciliação billingSyncPending — materializa o valor/ciclo ESPERADO no Asaas.
-- Gravados quando billingSyncPending é setado (sync falhou); a reconciliação compara
-- o esperado com o que o Asaas retorna. Migration ADITIVA, idempotente, sem destrutivo.

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "expectedAsaasValue" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "expectedAsaasCycle" "BillingCycle";
