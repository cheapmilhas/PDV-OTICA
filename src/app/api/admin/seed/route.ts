import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { logger } from "@/lib/logger";
import { adminRateLimit } from "@/lib/rate-limit";

const log = logger.child({ route: "admin/seed" });

/**
 * POST /api/admin/seed
 * Seeds: admin user, subscription da empresa existente, fix onboarding.
 * NÃO semeia planos — isso é feito EXCLUSIVAMENTE por `prisma/seed-plans.ts`
 * (fonte única de verdade no banco).
 * Requer autenticação admin.
 */
export async function POST(request: Request) {
  try {
    if (process.env.SEED_ENABLED !== "1") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // SEGURANÇA: defense-in-depth. Mesmo com SEED_ENABLED gate, só SUPER_ADMIN
    // pode disparar — evita que admin comum reset senha do super admin.
    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Permissão insuficiente" }, { status: 403 });
    }

    const limited = adminRateLimit("admin-seed", session.id, request);
    if (limited) return limited;

    const results: string[] = [];

    // ─── 1. Seed Admin User ─────────────────────────────────────────
    const adminEmail = "admin@pdvotica.com.br";
    // SEGURANÇA: senha NÃO mais hard-coded. Usa env var SEED_INITIAL_ADMIN_PASSWORD
    // se setada; senão, gera senha aleatória e devolve no response (única vez).
    const generatedPassword = crypto.randomBytes(16).toString("base64url");
    const adminPassword = process.env.SEED_INITIAL_ADMIN_PASSWORD || generatedPassword;
    const passwordSource = process.env.SEED_INITIAL_ADMIN_PASSWORD ? "env" : "generated";

    const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });

    if (existingAdmin) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await prisma.adminUser.update({
        where: { email: adminEmail },
        data: { password: hash, active: true },
      });
      results.push(`Admin já existia — senha resetada (fonte: ${passwordSource})`);
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
      results.push(`Admin criado com sucesso (senha fonte: ${passwordSource})`);
    }

    // ─── 2. Seed de Planos: REMOVIDO ─────────────────────────────────
    // O seed de planos agora é feito EXCLUSIVAMENTE por `prisma/seed-plans.ts`
    // (fonte única de verdade no banco). Este endpoint NÃO deve mais escrever
    // planos — o array hardcoded antigo estava desalinhado (slugs/preços/features
    // diferentes, sem os campos `status`/`highlightFeatures`) e sobrescrevia os
    // planos canônicos via upsert por slug, recriando o drift. Para semear/atualizar
    // planos, rode `prisma/seed-plans.ts`.

    // ─── 3. Criar Subscription + Fix Onboarding para empresa existente ───
    const company = await prisma.company.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (company) {
      // Buscar plano top-tier canônico (slug "rede" — ver prisma/seed-plans.ts).
      // O slug antigo "empresarial" não existe mais na fonte única de planos.
      const topTierPlan = await prisma.plan.findUnique({ where: { slug: "rede" } });

      if (topTierPlan) {
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
              planId: topTierPlan.id,
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
      // Senha gerada é exposta UMA VEZ pra quem rodou o seed.
      // Se veio de env, não devolvemos.
      ...(passwordSource === "generated" && {
        generatedAdminPassword: adminPassword,
        warning: "ANOTE a senha gerada — ela não será mostrada novamente.",
      }),
    });
  } catch (error) {
    log.error("Erro ao executar seed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro ao executar seed" }, { status: 500 });
  }
}
