-- Bug #3 — Adiciona campos de limite de crédito individual no Customer.
--
-- Comportamento:
--   - creditLimit NULL → cliente usa SystemRule customers.default_credit_limit
--   - creditLimit != NULL → cliente tem limite individual
--   - creditLimitOverridden = true marca explícita "este cliente tem regra própria"
--
-- Migration NÃO seta valores em registros existentes — todos ficam com creditLimit=NULL
-- (comportamento equivalente ao default da empresa).

-- AlterTable
ALTER TABLE "Customer"
  ADD COLUMN "creditLimit" DECIMAL(12,2),
  ADD COLUMN "creditLimitOverridden" BOOLEAN NOT NULL DEFAULT false;
