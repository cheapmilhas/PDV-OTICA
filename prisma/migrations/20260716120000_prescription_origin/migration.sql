-- Marca de ORIGEM da receita: varejo (Livro/OS/venda) x clínica (atendimento).
--
-- Por quê: o guard de fronteira varejo x clinica (prescription.service.ts)
-- inferia "e clinica" de `refractionExamId != null`. Inferencia frágil:
--   1. a FK e onDelete: SetNull -> apagada a refracao, a receita clinica vira
--      varejo aos olhos do guard;
--   2. a receita clinica AVULSA (prescrita direto, sem refracao) nasce com
--      refractionExamId = null -> nasceria DESPROTEGIDA, editavel/apagavel
--      pelo varejo (prescriptions.edit esta em GERENTE e VENDEDOR).
-- A origem passa a ser persistida na emissao, nunca inferida.
--
-- Aditiva. Default RETAIL preserva o comportamento de todas as linhas atuais
-- do varejo sem reescrever nada.

-- 1) Enum de origem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrescriptionOrigin') THEN
    CREATE TYPE "PrescriptionOrigin" AS ENUM ('RETAIL', 'CLINICAL');
  END IF;
END
$$;

-- 2) Coluna com default RETAIL (NOT NULL seguro: toda linha existente recebe o
--    default no ADD COLUMN).
ALTER TABLE "Prescription"
  ADD COLUMN IF NOT EXISTS "origin" "PrescriptionOrigin" NOT NULL DEFAULT 'RETAIL';

-- 3) Backfill: toda receita que hoje tem refracao vinculada E clinica.
--    Verificado no banco antes de escrever esta migration: 39 receitas totais,
--    1 com refractionExamId (seed vismed-dev-company), 38 de varejo em empresas
--    de producao. Este UPDATE toca exatamente essa 1 linha.
--    Idempotente: rodar de novo nao muda nada.
UPDATE "Prescription"
   SET "origin" = 'CLINICAL'
 WHERE "refractionExamId" IS NOT NULL
   AND "origin" <> 'CLINICAL';

-- 4) Indice parcial: o guard consulta origem por id; os relatorios clinicos
--    filtram por (companyId, origin). Parcial porque CLINICAL e a minoria.
CREATE INDEX IF NOT EXISTS "Prescription_companyId_origin_idx"
    ON "Prescription" ("companyId", "origin")
 WHERE "origin" = 'CLINICAL';
