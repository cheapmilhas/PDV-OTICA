import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { z } from "zod";

const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  priceMonthly: z.number().int().min(0).optional(),
  priceYearly: z.number().int().min(0).optional(),
  maxUsers: z.number().int().optional(),
  maxBranches: z.number().int().optional(),
  maxProducts: z.number().int().optional(),
  maxStorageMB: z.number().int().optional(),
  trialDays: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  features: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional(),
});

/**
 * PATCH /api/admin/plans/[id]
 * Atualiza um plano existente
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const data = updatePlanSchema.parse(body);

    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
    }

    const { features, ...planData } = data;

    const plan = await prisma.$transaction(async (tx) => {
      // Atualizar features se fornecidas
      if (features) {
        // Remover features antigas e criar novas
        await tx.planFeature.deleteMany({ where: { planId: id } });
        await tx.planFeature.createMany({
          data: features.map((f) => ({ planId: id, key: f.key, value: f.value })),
        });
      }

      // Atualizar plano
      return tx.plan.update({
        where: { id },
        data: planData,
        include: { features: true, _count: { select: { subscriptions: true } } },
      });
    });

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "PLAN_UPDATED",
        metadata: { planId: id, planName: plan.name, changes: Object.keys(data), adminEmail: admin.email },
      },
    });

    return NextResponse.json({ data: plan });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 400 });
    }
    console.error("[ADMIN-PLANS] Erro ao atualizar plano:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/plans/[id]
 * Desativa um plano (soft delete via isActive = false)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
  }

  // Não excluir fisicamente — apenas desativar
  const plan = await prisma.plan.update({
    where: { id },
    data: { isActive: false },
  });

  await prisma.globalAudit.create({
    data: {
      actorType: "ADMIN_USER",
      actorId: admin.id,
      action: "PLAN_DEACTIVATED",
      metadata: {
        planId: id,
        planName: existing.name,
        activeSubscriptions: existing._count.subscriptions,
        adminEmail: admin.email,
      },
    },
  });

  return NextResponse.json({ data: plan, message: "Plano desativado com sucesso" });
}
