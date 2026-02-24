import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { z } from "zod";

const createPlanSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  slug: z.string().min(1, "Slug é obrigatório").regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  description: z.string().optional(),
  priceMonthly: z.number().int().min(0),
  priceYearly: z.number().int().min(0),
  maxUsers: z.number().int().default(3),
  maxBranches: z.number().int().default(1),
  maxProducts: z.number().int().default(500),
  maxStorageMB: z.number().int().default(1000),
  trialDays: z.number().int().default(14),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  features: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).default([]),
});

/**
 * GET /api/admin/plans
 * Lista todos os planos com features e contagem de assinaturas
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      features: true,
      _count: { select: { subscriptions: true } },
    },
  });

  return NextResponse.json({ data: plans });
}

/**
 * POST /api/admin/plans
 * Cria um novo plano
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data = createPlanSchema.parse(body);

    const existing = await prisma.plan.findUnique({ where: { slug: data.slug } });
    if (existing) {
      return NextResponse.json({ error: "Já existe um plano com este slug" }, { status: 409 });
    }

    const { features, ...planData } = data;

    const plan = await prisma.plan.create({
      data: {
        ...planData,
        features: {
          create: features.map((f) => ({ key: f.key, value: f.value })),
        },
      },
      include: { features: true },
    });

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "PLAN_CREATED",
        metadata: { planName: plan.name, planSlug: plan.slug, adminEmail: admin.email },
      },
    });

    return NextResponse.json({ data: plan }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 400 });
    }
    console.error("[ADMIN-PLANS] Erro ao criar plano:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
