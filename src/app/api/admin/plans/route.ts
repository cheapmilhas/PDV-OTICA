import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { FEATURES } from "@/lib/plan-feature-catalog";
import { resolvePlanProductTier } from "./plan-product-tier";

const log = logger.child({ route: "admin/plans" });

// Keys válidas = catálogo real (mesma blindagem do PATCH). Rejeita key fora do
// catálogo antes de gravar PlanFeature.
const FEATURE_KEYS = Object.values(FEATURES) as [string, ...string[]];

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
  status: z.enum(["ACTIVE", "COMING_SOON"]).optional(),
  // Produto do plano. Ausente → VIS_APP (compat com planos óticos existentes).
  platformProduct: z.enum(["VIS_APP", "VIS_MEDICAL"]).default("VIS_APP"),
  // Tier bruto — validado contra o produto por resolvePlanProductTier (fail-closed).
  tier: z.enum(["clinic_full", "ophthalmology", "specialist"]).optional().nullable(),
  highlightFeatures: z.array(z.string()).optional().nullable(),
  features: z.array(z.object({
    key: z.enum(FEATURE_KEYS),
    value: z.enum(["true", "false"]),
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

    // Fail-closed produto×tier: medical exige tier conhecido; ótica normaliza null.
    const productTier = resolvePlanProductTier(data.platformProduct, data.tier);
    if (!productTier.ok) {
      return NextResponse.json({ error: productTier.error }, { status: 400 });
    }

    const { features, highlightFeatures, tier: _rawTier, ...planData } = data;

    const plan = await prisma.plan.create({
      data: {
        ...planData,
        tier: productTier.tier,
        // Json? do Prisma não aceita `null` cru: usar Prisma.JsonNull para limpar.
        ...(highlightFeatures !== undefined
          ? { highlightFeatures: highlightFeatures === null ? Prisma.JsonNull : highlightFeatures }
          : {}),
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

    revalidateTag("public-plans", "max");

    return NextResponse.json({ data: plan }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 400 });
    }
    log.error("Erro ao criar plano", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
