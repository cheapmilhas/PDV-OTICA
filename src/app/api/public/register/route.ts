import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * POST /api/public/register
 * Self-service registration: creates Company, Branch, User, UserBranch, Subscription (TRIAL).
 * No authentication required.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { name, email, phone, password, companyName, document, planId } = body;

    // Validações básicas
    if (!name || !email || !password || !companyName) {
      return NextResponse.json(
        { error: "Campos obrigatórios: nome, email, senha e nome da empresa" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Senha deve ter no mínimo 8 caracteres" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Email inválido" },
        { status: 400 }
      );
    }

    // Verificar email duplicado
    const existingUser = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este email já está cadastrado. Tente fazer login." },
        { status: 409 }
      );
    }

    // Verificar CNPJ/CPF duplicado (se fornecido)
    if (document) {
      const cleanDoc = document.replace(/\D/g, "");
      if (cleanDoc.length > 0) {
        const existingCompany = await prisma.company.findFirst({
          where: { cnpj: cleanDoc },
        });
        if (existingCompany) {
          return NextResponse.json(
            { error: "Já existe uma empresa cadastrada com este CNPJ/CPF." },
            { status: 409 }
          );
        }
      }
    }

    // Buscar plano (se informado) ou usar o primeiro ativo
    let plan = null;
    if (planId) {
      plan = await prisma.plan.findUnique({
        where: { id: planId, isActive: true },
      });
    }
    if (!plan) {
      plan = await prisma.plan.findFirst({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      });
    }

    if (!plan) {
      return NextResponse.json(
        { error: "Nenhum plano disponível no momento. Tente novamente mais tarde." },
        { status: 500 }
      );
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Gerar slug único a partir do nome da empresa
    const baseSlug = companyName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    let slug = baseSlug;
    let slugSuffix = 1;
    while (await prisma.company.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${slugSuffix}`;
      slugSuffix++;
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar empresa
      const company = await tx.company.create({
        data: {
          name: companyName.trim(),
          tradeName: companyName.trim(),
          cnpj: document ? document.replace(/\D/g, "") || null : null,
          phone: phone?.trim() || null,
          email: email.toLowerCase().trim(),
          slug,
          accessEnabled: true,
          accessEnabledAt: now,
          onboardingStatus: "ACTIVE",
          onboardingStep: 0,
          maxUsers: plan.maxUsers,
          maxProducts: plan.maxProducts,
          maxBranches: plan.maxBranches,
        },
      });

      // 2. Criar filial principal
      const branch = await tx.branch.create({
        data: {
          companyId: company.id,
          name: companyName.trim() + " - Matriz",
        },
      });

      // 3. Criar usuário admin
      const user = await tx.user.create({
        data: {
          companyId: company.id,
          name: name.trim(),
          email: email.toLowerCase().trim(),
          passwordHash,
          role: "ADMIN",
        },
      });

      // 4. Vincular usuário à filial
      await tx.userBranch.create({
        data: {
          userId: user.id,
          branchId: branch.id,
        },
      });

      // 5. Criar assinatura trial
      await tx.subscription.create({
        data: {
          companyId: company.id,
          planId: plan.id,
          status: "TRIAL",
          trialStartedAt: now,
          trialEndsAt,
          billingCycle: "MONTHLY",
        },
      });

      // 6. Auditoria
      await tx.globalAudit.create({
        data: {
          actorType: "USER",
          actorId: user.id,
          companyId: company.id,
          action: "SELF_REGISTRATION",
          metadata: {
            planId: plan.id,
            planName: plan.name,
            trialDays: plan.trialDays,
          },
        },
      });

      return { company, user };
    });

    return NextResponse.json({
      success: true,
      message: "Conta criada com sucesso! Faça login para começar.",
      companyId: result.company.id,
      email: result.user.email,
    });
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json(
      { error: "Erro ao criar conta. Tente novamente." },
      { status: 500 }
    );
  }
}
