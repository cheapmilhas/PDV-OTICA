/**
 * Seed CIRÚRGICO: liga SÓ a feature "goals" (Metas & Comissões) no plano Básico.
 *
 * Contexto: o Básico tem todas as 15 features = "false" por design. O dono
 * decidiu liberar "Metas" (e, por tabela, a tela de comissões/config que já
 * dependem só de permissão) também no Básico.
 *
 * Por que cirúrgico (e NÃO o seed-plan-basico-features.ts):
 *  - Mexe em UMA única linha: PlanFeature(Básico, "goals") → "true".
 *  - NÃO usa deleteMany. NÃO toca nas outras 14 features nem nos planos pagos.
 *  - Idempotente (upsert): rodar 2x dá o mesmo estado final.
 *
 * Rollback: `npx tsx prisma/seed-basico-goals-off.ts` (volta "goals"→"false").
 * Kill switch global: env DISABLE_PLAN_FEATURE_GATING=true (libera tudo, sem deploy).
 *
 * ⚠️ Cache: a resolução de features tem LRU em memória com TTL ~5min
 * (plan-features-cache.ts). Após rodar, a convergência é automática em até 5min;
 * para forçar imediato, trocar o plano de uma empresa via admin invalida o cache.
 */
import { PrismaClient } from "@prisma/client";
import { FEATURES } from "../src/lib/plan-feature-catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed:goals-on] Ligando feature 'goals' no plano Básico…");

  await prisma.$transaction(
    async (tx) => {
      const basico = await tx.plan.findUniqueOrThrow({ where: { slug: "basico" } });

      await tx.planFeature.upsert({
        where: { planId_key: { planId: basico.id, key: FEATURES.GOALS } },
        update: { value: "true" },
        create: { planId: basico.id, key: FEATURES.GOALS, value: "true" },
      });

      console.log(`[seed:goals-on] Básico: feature '${FEATURES.GOALS}' = "true" (1 linha, demais intactas)`);
    },
    { timeout: 30_000 },
  );

  console.log("[seed:goals-on] ✓ Concluído. Cache LRU converge em até 5min (TTL).");
}

main()
  .catch((err) => {
    console.error("[seed:goals-on] ✗ Falhou:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
