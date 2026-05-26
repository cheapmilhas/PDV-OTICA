/**
 * Variante do seed que SÓ atualiza planos pagos (NÃO mexe no Básico).
 *
 * Uso no Passo 6 do rollout (D-1 do go-live):
 *  - Garante que profissional/enterprise tenham 13 features = "true" no banco
 *    ANTES de fazermos o flip do Básico no Passo 7.
 *  - Isso elimina janela em que algum cliente pago pudesse ficar bloqueado por
 *    inexistência de PlanFeature explicito.
 *
 * Idempotente (upsert). Roda em transação.
 */
import { PrismaClient } from "@prisma/client";
import { FEATURES } from "../src/lib/plan-feature-catalog";

const prisma = new PrismaClient();

const PAID_PLAN_SLUGS = ["profissional", "enterprise"];

async function main() {
  console.log("[seed-paid-only] Atualizando apenas planos pagos…");

  await prisma.$transaction(
    async (tx) => {
      for (const slug of PAID_PLAN_SLUGS) {
        const plan = await tx.plan.findUnique({ where: { slug } });
        if (!plan) {
          console.warn(`[seed-paid-only] Plano '${slug}' não encontrado — pulando.`);
          continue;
        }
        for (const key of Object.values(FEATURES)) {
          await tx.planFeature.upsert({
            where: { planId_key: { planId: plan.id, key } },
            update: { value: "true" },
            create: { planId: plan.id, key, value: "true" },
          });
        }
        console.log(`[seed-paid-only] ${slug}: ${Object.keys(FEATURES).length} features=true`);
      }
    },
    { timeout: 30_000 },
  );

  console.log("[seed-paid-only] ✓ Concluído.");
}

main()
  .catch((err) => {
    console.error("[seed-paid-only] ✗ Falhou:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
