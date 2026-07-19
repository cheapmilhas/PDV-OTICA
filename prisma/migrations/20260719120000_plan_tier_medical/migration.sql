-- Emissao de tiers Vis->Domus (Fase 1: catalogo). Aditiva e idempotente.
--
-- Adiciona a classificacao de tier aos planos Medical. O EFEITO de cada tier
-- (quais modulos o Domus corta) vive no Domus (plan-features.ts); aqui so
-- classificamos qual plano tem qual tier.
--
-- Decisoes:
--  - platformProduct em Plan (default VIS_APP): sem isto, resolvePlanForTier
--    poderia pegar um plano de otica com o mesmo tier. Todos os planos atuais
--    sao de otica -> nascem VIS_APP corretamente.
--  - tier NULLABLE (nao NOT NULL DEFAULT): plano de otica nao tem tier; plano
--    Medical SEM tier = fail-closed em resolvePlanForTier (nunca "tudo liberado"
--    por engano). Ausencia de default forca classificacao explicita.
--  - selfServiceSelectable default false: so os 2 planos comerciais Medical
--    (Profissional/Clinica) ficam true; interno-domus R$0 fica false.
--
-- Migracao NAO cria os planos (isso e seed explicito: prisma/seed-medical-plans.ts).
-- Aplicar SO com `prisma migrate deploy` (nunca migrate dev/db push -- .env=prod).

-- Enum PlanTier. CREATE TYPE direto (sem guard): o ledger do _prisma_migrations
-- garante execucao unica, e um guard que so checa o NOME mascararia um tipo
-- pre-existente com labels errados (achado Codex). Preflight confirmou:
-- public."PlanTier" NAO existe em nenhum schema antes deste deploy.
CREATE TYPE "PlanTier" AS ENUM ('clinic_full', 'ophthalmology', 'specialist');

ALTER TABLE "Plan" ADD COLUMN "platformProduct" "PlatformProduct" NOT NULL DEFAULT 'VIS_APP';
ALTER TABLE "Plan" ADD COLUMN "tier" "PlanTier";
ALTER TABLE "Plan" ADD COLUMN "selfServiceSelectable" BOOLEAN NOT NULL DEFAULT false;
