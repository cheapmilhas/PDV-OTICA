-- Q8.2.3: idempotência server-side de POST /api/sales.
-- Um Idempotency-Key repetido retorna a venda já criada em vez de duplicar.
-- Migration ADITIVA (tabela nova), idempotente.

CREATE TABLE IF NOT EXISTS "SaleIdempotency" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SaleIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SaleIdempotency_companyId_key_key"
    ON "SaleIdempotency"("companyId", "key");

CREATE INDEX IF NOT EXISTS "SaleIdempotency_expiresAt_idx"
    ON "SaleIdempotency"("expiresAt");

-- FK para Sale (não falha se já existir via bloco condicional).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SaleIdempotency_saleId_fkey'
  ) THEN
    ALTER TABLE "SaleIdempotency"
      ADD CONSTRAINT "SaleIdempotency_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
