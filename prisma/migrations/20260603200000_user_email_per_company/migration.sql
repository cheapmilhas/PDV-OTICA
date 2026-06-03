-- Q8.4: User.email passa de ÚNICO GLOBAL para ÚNICO POR EMPRESA.
-- Motivo: o @unique global impedia o mesmo email/login em empresas diferentes
-- (dono com 2 lojas, funcionário em 2 óticas-cliente). O índice global atual já
-- garante que NÃO há duplicatas, então migrar para um índice por-empresa (mais
-- frouxo) é seguro — a desduplicação abaixo é defensiva (cobre variações de
-- caixa que um índice case-sensitive teria deixado passar).

-- 1. Desduplica por (companyId, lower(email)) de forma conservadora: mantém o
--    usuário MAIS ANTIGO; renomeia o email dos demais inserindo o sufixo NO
--    LOCAL-PART (antes do @) para manter um endereço estruturalmente válido
--    (ex.: joao+dup-<id>@x.com). Não perde o usuário nem trava o índice. Em
--    prática deve ser no-op (o unique global atual garante zero dupes hoje).
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
SET "email" = CASE
  WHEN position('@' in u."email") > 0
    THEN overlay(u."email" placing ('+dup-' || u."id") from position('@' in u."email") for 0)
  ELSE u."email" || '+dup-' || u."id"
END
FROM ranked r
WHERE u."id" = r."id" AND r.rn > 1;

-- 2. Remove o índice único GLOBAL antigo. NÃO confiamos no nome default do
--    Prisma ("User_email_key") — se a tabela foi criada por db push / script,
--    o nome pode diferir e um DROP IF EXISTS seria no-op SILENCIOSO (o unique
--    global continuaria, quebrando a feature). Aqui derrubamos QUALQUER índice
--    único de coluna única sobre User(email), seja qual for o nome, e também
--    qualquer UNIQUE CONSTRAINT homônima.
DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT i.relname AS index_name
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE t.relname = 'User'
      AND ix.indisunique
      AND a.attname = 'email'
      AND array_length(ix.indkey, 1) = 1   -- só (email), não composto
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx.index_name);
    -- se for via constraint, o DROP INDEX falha; tenta drop da constraint.
    BEGIN
      EXECUTE format('ALTER TABLE "User" DROP CONSTRAINT IF EXISTS %I', idx.index_name);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

-- 3. Cria o índice único POR EMPRESA, case-insensitive (lower(email)) — espelha
--    o padrão de Customer_companyId_email_unique (M7) e o login case-insensitive.
CREATE UNIQUE INDEX "User_companyId_email_unique"
  ON "User" ("companyId", lower("email"));

-- 4. Índice de consulta plano declarado no schema (@@index([companyId, email])).
CREATE INDEX "User_companyId_email_idx" ON "User" ("companyId", "email");
