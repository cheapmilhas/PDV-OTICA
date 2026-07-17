-- P3 (commit 2): vínculo Vis (operadora) → Domus (produto clínico).
-- Migration ADITIVA e idempotente. Nada destrutivo, nada obrigatório.
--
-- O Domus é outro sistema, com banco SEPARADO (drizzle+pg). Não há FK possível
-- daqui para lá — este campo é o lado Vis de um vínculo 1:1 mantido por
-- aplicação. A unicidade impede que duas Companies apontem para a mesma
-- clínica (o que faria duas assinaturas disputarem o mesmo tenant clínico).
--
-- Nullable de propósito: as 13 óticas (VIS_APP) nunca terão clínica.

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "domusClinicId" UUID;

-- Unicidade parcial: só vale para quem tem vínculo. NULL não colide com NULL
-- no Postgres, mas o índice parcial deixa a intenção explícita e é mais barato.
CREATE UNIQUE INDEX IF NOT EXISTS "Company_domusClinicId_key"
  ON "Company"("domusClinicId")
  WHERE "domusClinicId" IS NOT NULL;
