import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

/**
 * POST /api/admin/seed
 * Seeds: admin user, planos, subscription da empresa existente, fix onboarding.
 * Requer autenticação admin.
 */
export async function POST() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const results: string[] = [];

    // ─── 1. Seed Admin User ─────────────────────────────────────────
    const adminEmail = "admin@pdvotica.com.br";
    const adminPassword = "admin123";

    const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });

    if (existingAdmin) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await prisma.adminUser.update({
        where: { email: adminEmail },
        data: { password: hash, active: true },
      });
      results.push("Admin já existia — senha resetada para admin123");
    } else {
      const hash = await bcrypt.hash(adminPassword, 10);
      await prisma.adminUser.create({
        data: {
          email: adminEmail,
          name: "Administrador",
          password: hash,
          role: "SUPER_ADMIN",
          active: true,
        },
      });
      results.push("Admin criado com sucesso");
    }

    // ─── 2. Seed Planos ─────────────────────────────────────────────
    const plansData = [
      {
        name: "Básico",
        slug: "basico",
        description: "Ideal para óticas pequenas que estão começando a digitalizar suas operações.",
        priceMonthly: 14990, // R$ 149,90 em centavos
        priceYearly: 149900, // R$ 1.499,00 em centavos (12x com desconto)
        maxUsers: 3,
        maxBranches: 1,
        maxProducts: 500,
        maxStorageMB: 1000,
        trialDays: 14,
        sortOrder: 1,
        isActive: true,
        isFeatured: false,
        features: [] as { key: string; value: string }[],
      },
      {
        name: "Profissional",
        slug: "profissional",
        description: "Para óticas em crescimento que precisam de ferramentas avançadas de gestão.",
        priceMonthly: 24990, // R$ 249,90
        priceYearly: 249900, // R$ 2.499,00
        maxUsers: 10,
        maxBranches: 3,
        maxProducts: 2000,
        maxStorageMB: 5000,
        trialDays: 14,
        sortOrder: 2,
        isActive: true,
        isFeatured: true,
        features: [
          { key: "crm", value: "true" },
          { key: "goals", value: "true" },
        ],
      },
      {
        name: "Empresarial",
        slug: "empresarial",
        description: "Solução completa para redes de óticas com múltiplas filiais.",
        priceMonthly: 49990, // R$ 499,90
        priceYearly: 499900, // R$ 4.999,00
        maxUsers: 999,
        maxBranches: 99,
        maxProducts: 99999,
        maxStorageMB: 50000,
        trialDays: 14,
        sortOrder: 3,
        isActive: true,
        isFeatured: false,
        features: [
          { key: "crm", value: "true" },
          { key: "goals", value: "true" },
          { key: "campaigns", value: "true" },
          { key: "cashback", value: "true" },
          { key: "multi_branch", value: "true" },
          { key: "reports_advanced", value: "true" },
        ],
      },
    ];

    for (const planData of plansData) {
      const { features, ...planFields } = planData;

      const existingPlan = await prisma.plan.findUnique({ where: { slug: planFields.slug } });

      if (existingPlan) {
        await prisma.plan.update({
          where: { slug: planFields.slug },
          data: planFields,
        });
        // Atualizar features: deletar existentes e recriar
        await prisma.planFeature.deleteMany({ where: { planId: existingPlan.id } });
        if (features.length > 0) {
          await prisma.planFeature.createMany({
            data: features.map((f) => ({ planId: existingPlan.id, ...f })),
          });
        }
        results.push(`Plano "${planFields.name}" atualizado`);
      } else {
        const newPlan = await prisma.plan.create({
          data: {
            ...planFields,
            features: {
              create: features,
            },
          },
        });
        results.push(`Plano "${planFields.name}" criado (id: ${newPlan.id})`);
      }
    }

    // ─── 3. Criar Subscription + Fix Onboarding para empresa existente ───
    const company = await prisma.company.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (company) {
      // Buscar plano Empresarial
      const empresarialPlan = await prisma.plan.findUnique({ where: { slug: "empresarial" } });

      if (empresarialPlan) {
        // Verificar se já tem subscription
        const existingSub = await prisma.subscription.findFirst({
          where: { companyId: company.id },
        });

        if (!existingSub) {
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);

          await prisma.subscription.create({
            data: {
              companyId: company.id,
              planId: empresarialPlan.id,
              status: "ACTIVE",
              billingCycle: "YEARLY",
              activatedAt: now,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
          });
          results.push(`Subscription ACTIVE criada para "${company.tradeName || company.name}"`);
        } else {
          results.push(`Empresa "${company.tradeName || company.name}" já tem subscription`);
        }
      }

      // Fix onboarding: setar como concluído
      if (!company.onboardingDoneAt) {
        await prisma.company.update({
          where: { id: company.id },
          data: {
            onboardingStep: 4,
            onboardingDoneAt: new Date(),
          },
        });
        results.push(`Onboarding marcado como concluído para "${company.tradeName || company.name}"`);
      } else {
        results.push(`Onboarding já estava concluído para "${company.tradeName || company.name}"`);
      }
    } else {
      results.push("Nenhuma empresa encontrada no banco");
    }

    return NextResponse.json({
      message: "Seed executado com sucesso",
      results,
    });
  } catch (error) {
    console.error("[ADMIN-SEED] Erro:", error);
    return NextResponse.json({ error: "Erro ao executar seed" }, { status: 500 });
  }
}
