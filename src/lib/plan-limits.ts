import { prisma } from "@/lib/prisma";
import { forbiddenError } from "@/lib/error-handler";

/**
 * Verifica se a empresa atingiu o limite do plano para um recurso.
 * Lança forbiddenError se o limite foi atingido.
 *
 * Limites são definidos no Plan associado à subscription ativa da empresa.
 * Se não houver subscription, permite (empresa pode estar em modo accessEnabled).
 * Valor -1 = ilimitado.
 */
export async function checkPlanLimit(
  companyId: string,
  resource: "users" | "products" | "branches"
): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      companyId,
      status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] },
    },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });

  // Sem subscription ativa — não enforçar limites
  if (!subscription) return;

  const plan = subscription.plan;

  const limitMap = {
    users: plan.maxUsers,
    products: plan.maxProducts,
    branches: plan.maxBranches,
  };

  const limit = limitMap[resource];

  // -1 = ilimitado
  if (limit === -1) return;

  const countMap = {
    users: () =>
      prisma.user.count({
        where: { companyId, active: true },
      }),
    products: () =>
      prisma.product.count({
        where: { companyId, active: true },
      }),
    branches: () =>
      prisma.branch.count({
        where: { companyId, active: true },
      }),
  };

  const currentCount = await countMap[resource]();

  if (currentCount >= limit) {
    const labels = {
      users: "usuários",
      products: "produtos",
      branches: "filiais",
    };
    throw forbiddenError(
      `Limite do plano atingido: máximo de ${limit} ${labels[resource]}. Faça upgrade para adicionar mais.`
    );
  }
}
