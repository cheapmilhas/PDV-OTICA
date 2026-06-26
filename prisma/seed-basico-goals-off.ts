/**
 * Rollback CIRÚRGICO de seed-basico-goals-on.ts: desliga SÓ a feature "goals"
 * (Metas & Comissões) no plano Básico, voltando ao estado original ("false").
 *
 * Mexe em UMA única linha: PlanFeature(Básico, "goals") → "false". NÃO usa
 * deleteMany, NÃO toca nas outras 14 features nem nos planos pagos. Idempotente.
 *
 * ⚠️ Cache: convergência automática em até 5min (LRU TTL). Ver seed-basico-goals-on.ts.
 */
import { PrismaClient } from "@prisma/client";
import { FEATURES } from "../src/lib/plan-feature-catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed:goals-off] Desligando feature 'goals' no plano Básico…");

  await prisma.$transaction(
    async (tx) => {
      const basico = await tx.plan.findUniqueOrThrow({ where: { slug: "basico" } });

      await tx.planFeature.upsert({
        where: { planId_key: { planId: basico.id, key: FEATURES.GOALS } },
        update: { value: "false" },
        create: { planId: basico.id, key: FEATURES.GOALS, value: "false" },
      });

      console.log(`[seed:goals-off] Básico: feature '${FEATURES.GOALS}' = "false" (revertido)`);
    },
    { timeout: 30_000 },
  );

  console.log("[seed:goals-off] ✓ Concluído. Cache LRU converge em até 5min (TTL).");
}

main()
  .catch((err) => {
    console.error("[seed:goals-off] ✗ Falhou:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
