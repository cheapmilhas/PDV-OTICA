import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { PlanosClient } from "./planos-client";

export default async function PlanosPage() {
  await requireAdmin();

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      features: true,
      _count: { select: { subscriptions: true } },
    },
  });

  const serializedPlans = plans.map((plan) => ({
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    features: plan.features.map((f) => ({ id: f.id, key: f.key, value: f.value, planId: f.planId })),
  }));

  return <PlanosClient initialPlans={serializedPlans} />;
}
