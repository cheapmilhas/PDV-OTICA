/**
 * Rollback do seed do plano Básico — reverte:
 *  - preço: 14990 → 14900 (priceMonthly), 149900 → 149000 (priceYearly)
 *  - 16 features no Básico: "false" → "true"
 *
 * NÃO reverte planos pagos (manter ativos é seguro mesmo após rollback).
 *
 * Quando usar:
 *  - Plano de comunicação D+? recebe muito ruído de clientes Básico perdendo
 *    acesso e equipe decide reverter rapidamente.
 *  - Kill switch resolve INSTANTANEAMENTE (sem deploy), MAS deixa a feature ainda
 *    como "false" no banco. Esse rollback restaura também o estado do banco.
 *
 * Idempotente (upsert). Roda em transação.
 */
import { PrismaClient } from "@prisma/client";
import { FEATURES } from "../src/lib/plan-feature-catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("[rollback] Revertendo plano Básico…");

  await prisma.$transaction(
    async (tx) => {
      const basico = await tx.plan.findUniqueOrThrow({ where: { slug: "basico" } });

      // 1) Preço
      await tx.plan.update({
        where: { id: basico.id },
        data: { priceMonthly: 14900, priceYearly: 149000 },
      });
      console.log("[rollback] Básico: priceMonthly=14900, priceYearly=149000");

      // 2) 16 features = "true" no Básico
      for (const key of Object.values(FEATURES)) {
        await tx.planFeature.upsert({
          where: { planId_key: { planId: basico.id, key } },
          update: { value: "true" },
          create: { planId: basico.id, key, value: "true" },
        });
      }
      console.log(`[rollback] Básico: ${Object.keys(FEATURES).length} features=true (reverted)`);
    },
    { timeout: 30_000 },
  );

  console.log("[rollback] ✓ Concluído. Não esquecer de invalidar o cache em prod:");
  console.log("[rollback]   - LRU em memória tem TTL 5min → convergência automática");
  console.log("[rollback]   - OU forçar via POST /api/admin/clientes/<id>/actions change_plan (cada empresa)");
}

main()
  .catch((err) => {
    console.error("[rollback] ✗ Falhou:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
