-- Migration B (Rotina de Testes Óticas Ultra / F4): backfill + counter + NOT NULL
-- + unique. Aplicar SOMENTE DEPOIS de o código (F4.4b) já estar numerando vendas
-- novas em produção, para que não exista insert sem número quando o NOT NULL
-- entrar em vigor.

-- RENUMERA TODAS as linhas por createdAt (cronologia correta: #1 = venda mais
-- antiga). Inclui as poucas vendas já numeradas pelo código entre as 2 migrations
-- — são reescritas para a posição cronológica certa. Como o índice unique ainda
-- NÃO existe neste ponto, a reescrita em massa não colide. Tiebreaker em id;
-- inclui soft-deleted (deletedAt não filtra).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "companyId" ORDER BY "createdAt" ASC, "id" ASC
  ) AS rn
  FROM "Sale"
)
UPDATE "Sale" s SET "number" = ranked.rn FROM ranked WHERE s.id = ranked.id;

-- seed/atualiza Counter key 'sale' no MAX por empresa. GREATEST garante que, se o
-- counter já avançou (código numerando na janela de deploy), o próximo número
-- continue do topo e nunca colida com o backfill.
INSERT INTO "Counter" ("id","companyId","key","value")
SELECT gen_random_uuid()::text, "companyId", 'sale', MAX("number")
FROM "Sale" GROUP BY "companyId"
ON CONFLICT ("companyId","key") DO UPDATE SET "value" = GREATEST("Counter"."value", EXCLUDED."value");

-- NOT NULL (toda linha já tem número após o UPDATE acima)
ALTER TABLE "Sale" ALTER COLUMN "number" SET NOT NULL;

-- unique criado DEPOIS da renumeração em massa (senão a reescrita colidiria)
CREATE UNIQUE INDEX "Sale_companyId_number_key" ON "Sale"("companyId","number");
