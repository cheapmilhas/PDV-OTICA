-- Vis Medical F0: discriminador de produto + vínculo por titularidade.
-- Migration ADITIVA e idempotente. Sem destrutivo. Backfill implícito pelo DEFAULT.

-- 1. Enum PlatformProduct (padrão DO $$ do projeto)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformProduct') THEN
    CREATE TYPE "PlatformProduct" AS ENUM ('VIS_APP', 'VIS_MEDICAL');
  END IF;
END$$;

-- 2. Tabela de grupo de titularidade
CREATE TABLE IF NOT EXISTS "company_owner_groups" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_owner_groups_pkey" PRIMARY KEY ("id")
);

-- 3. Colunas novas na Company (tabela SEM @@map → "Company")
--    platformProduct: NOT NULL com DEFAULT → todas as linhas existentes viram VIS_APP.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "platformProduct" "PlatformProduct" NOT NULL DEFAULT 'VIS_APP',
  ADD COLUMN IF NOT EXISTS "ownerGroupId" TEXT;

-- 4. FK ownerGroupId → company_owner_groups (SetNull: apagar o grupo não apaga a empresa)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Company_ownerGroupId_fkey'
  ) THEN
    ALTER TABLE "Company"
      ADD CONSTRAINT "Company_ownerGroupId_fkey"
      FOREIGN KEY ("ownerGroupId") REFERENCES "company_owner_groups"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- 5. Índices
CREATE INDEX IF NOT EXISTS "Company_platformProduct_idx" ON "Company"("platformProduct");
CREATE INDEX IF NOT EXISTS "Company_ownerGroupId_idx" ON "Company"("ownerGroupId");
