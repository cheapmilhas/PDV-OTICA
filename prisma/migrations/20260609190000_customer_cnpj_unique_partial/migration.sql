-- Blindagem (Fase A): CNPJ de cliente duplicado era barrado só em app-level
-- (findFirst + create não-atômico = race). Este índice único PARCIAL garante no
-- banco que não há 2 clientes com o mesmo CNPJ na mesma empresa — sem bloquear
-- clientes SEM CNPJ (PF não tem CNPJ).

-- 1. Normaliza cnpj vazio/whitespace → NULL (vazios colidiriam no índice;
--    NULLs não colidem entre si no Postgres). Também tira máscara de legados.
UPDATE "Customer"
SET "cnpj" = NULL
WHERE "cnpj" IS NOT NULL AND btrim("cnpj") = '';

UPDATE "Customer"
SET "cnpj" = regexp_replace("cnpj", '\D', '', 'g')
WHERE "cnpj" IS NOT NULL AND "cnpj" <> regexp_replace("cnpj", '\D', '', 'g');

-- Após remover máscara, algum cnpj pode ter virado '' → NULL.
UPDATE "Customer"
SET "cnpj" = NULL
WHERE "cnpj" IS NOT NULL AND "cnpj" = '';

-- 2. Desduplica cnpjs existentes (conservador): mantém o cliente MAIS ANTIGO
--    com o cnpj; anula o cnpj dos demais (não perde o cliente). Sem isso o
--    CREATE UNIQUE INDEX abaixo falharia.
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "companyId", "cnpj"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "Customer"
  WHERE "cnpj" IS NOT NULL
)
UPDATE "Customer" c
SET "cnpj" = NULL
FROM ranked r
WHERE c."id" = r."id" AND r.rn > 1;

-- 3. Índice único parcial só onde há cnpj.
CREATE UNIQUE INDEX "Customer_companyId_cnpj_unique"
  ON "Customer" ("companyId", "cnpj")
  WHERE "cnpj" IS NOT NULL;
