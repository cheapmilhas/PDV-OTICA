/**
 * Seed idempotente para o flip do plano Básico (Fase 7 do rollout de feature gating).
 *
 * Roda dentro de uma única $transaction:
 *  1. Atualiza preço do Básico: priceMonthly 14900 → 14990, priceYearly 149000 → 149900
 *  2. Garante 16 PlanFeature = "false" no Básico
 *  3. Garante 16 PlanFeature = "true" nos planos pagos (profissional, enterprise)
 *
 * É 100% upsert — rodar 2x dá o mesmo estado final.
 *
 * Para reverter (caso o flip cause problemas):
 *  - kill switch via env var DISABLE_PLAN_FEATURE_GATING=true (instantâneo, sem deploy)
 *  - OU `npx tsx prisma/seed-plan-basico-features-rollback.ts` (reverte só o Básico)
 *
 * Para rodar SÓ os planos pagos (Passo 6 do rollout — D-1):
 *  - `npx tsx prisma/seed-plan-basico-features-paid-only.ts`
 */
import { PrismaClient } from "@prisma/client";
import { FEATURES } from "../src/lib/plan-feature-catalog";

const prisma = new PrismaClient();

const PAID_PLAN_SLUGS = ["profissional", "enterprise"];

async function main() {
  console.log("[seed] Iniciando seed do plano Básico + features gated…");

  await prisma.$transaction(
    async (tx) => {
      // 1) Preço do Básico
      const basico = await tx.plan.findUniqueOrThrow({ where: { slug: "basico" } });
      await tx.plan.update({
        where: { id: basico.id },
        data: { priceMonthly: 14990, priceYearly: 149900 },
      });
      console.log(`[seed] Básico: priceMonthly=14990, priceYearly=149900`);

      // 2) 16 features = "false" no Básico
      for (const key of Object.values(FEATURES)) {
        await tx.planFeature.upsert({
          where: { planId_key: { planId: basico.id, key } },
          update: { value: "false" },
          create: { planId: basico.id, key, value: "false" },
        });
      }
      console.log(`[seed] Básico: ${Object.keys(FEATURES).length} features=false`);

      // 3) 16 features = "true" em planos pagos
      for (const slug of PAID_PLAN_SLUGS) {
        const plan = await tx.plan.findUnique({ where: { slug } });
        if (!plan) {
          console.warn(`[seed] Plano '${slug}' não encontrado — pulando.`);
          continue;
        }
        for (const key of Object.values(FEATURES)) {
          await tx.planFeature.upsert({
            where: { planId_key: { planId: plan.id, key } },
            update: { value: "true" },
            create: { planId: plan.id, key, value: "true" },
          });
        }
        console.log(`[seed] ${slug}: ${Object.keys(FEATURES).length} features=true`);
      }
    },
    { timeout: 30_000 },
  );

  console.log("[seed] ✓ Concluído com sucesso.");
}

main()
  .catch((err) => {
    console.error("[seed] ✗ Falhou:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
