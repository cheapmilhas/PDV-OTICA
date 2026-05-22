-- Adiciona colunas de preço/margem em branch_stocks que existem no schema.prisma
-- mas estavam ausentes no banco — drift causava 500 em /api/products
-- (Prisma incluía branchStocks com select dessas colunas).

ALTER TABLE "branch_stocks"
  ADD COLUMN IF NOT EXISTS "cost_price"     DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "sale_price"     DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "promo_price"    DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "margin_percent" DECIMAL(5, 2);
