-- M7 (auditoria dogfood): email de cliente duplicado era barrado só em
-- app-level (findFirst + create/update não-atômico = race). Este índice único
-- PARCIAL garante no banco que não há 2 clientes com o mesmo email na mesma
-- empresa — sem bloquear clientes SEM email (email é opcional em ótica).

-- 1. Normaliza email vazio/whitespace → NULL (vazios colidiriam no índice;
--    NULLs não colidem entre si no Postgres).
UPDATE "Customer"
SET "email" = NULL
WHERE "email" IS NOT NULL AND btrim("email") = '';

-- 2. Desduplica emails existentes (conservador): mantém o cliente MAIS ANTIGO
--    com o email; anula o email dos demais (não perde o cliente, só libera o
--    email). Sem isso o CREATE UNIQUE INDEX abaixo falharia.
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "companyId", lower("email")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "Customer"
  WHERE "email" IS NOT NULL
)
UPDATE "Customer" c
SET "email" = NULL
FROM ranked r
WHERE c."id" = r."id" AND r.rn > 1;

-- 3. Índice único parcial (case-insensitive) só onde há email.
CREATE UNIQUE INDEX "Customer_companyId_email_unique"
  ON "Customer" ("companyId", lower("email"))
  WHERE "email" IS NOT NULL;
