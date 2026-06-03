-- Q8.4: User.email passa de ÚNICO GLOBAL para ÚNICO POR EMPRESA.
-- Motivo: o @unique global impedia o mesmo email/login em empresas diferentes
-- (dono com 2 lojas, funcionário em 2 óticas-cliente). O índice global atual já
-- garante que NÃO há duplicatas, então migrar para um índice por-empresa (mais
-- frouxo) é seguro — a desduplicação abaixo é defensiva (cobre variações de
-- caixa que um índice case-sensitive teria deixado passar).

-- 1. Desduplica por (companyId, lower(email)) de forma conservadora: mantém o
--    usuário MAIS ANTIGO; renomeia o email dos demais sufixando o id (não perde
--    o usuário nem trava o índice). Em prática deve ser no-op (não há dupes).
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "companyId", lower("email")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "User"
)
UPDATE "User" u
SET "email" = u."email" || '+dup-' || u."id"
FROM ranked r
WHERE u."id" = r."id" AND r.rn > 1;

-- 2. Remove o índice único GLOBAL antigo (nome default do Prisma para @unique).
DROP INDEX IF EXISTS "User_email_key";

-- 3. Cria o índice único POR EMPRESA, case-insensitive (lower(email)) — espelha
--    o padrão de Customer_companyId_email_unique (M7) e o login case-insensitive.
CREATE UNIQUE INDEX "User_companyId_email_unique"
  ON "User" ("companyId", lower("email"));

-- 4. Índice de consulta plano declarado no schema (@@index([companyId, email])).
CREATE INDEX "User_companyId_email_idx" ON "User" ("companyId", "email");
