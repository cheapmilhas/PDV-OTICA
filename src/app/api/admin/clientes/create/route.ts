import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();

  const {
    tradeName,
    companyName,
    cnpj,
    stateRegistration,
    email,
    phone,
    whatsapp,
    zipCode,
    address,
    addressNumber,
    complement,
    neighborhood,
    city,
    state,
    ownerName,
    ownerCpf,
    ownerEmail,
    ownerPhone,
    planId,
    billingCycle,
    trialDays,
    discountPercent,
    isNetwork,
    networkMode,
    newNetworkName,
    existingNetworkId,
    acquisitionChannel,
    notes,
    sendInviteEmail,
    // Novos campos — admin da ótica
    adminName,
    adminEmail,
    adminPassword,
  } = body;

  // Validações
  if (!tradeName || !cnpj || !email || !city || !state || !ownerName || !ownerEmail || !planId) {
    return NextResponse.json({ error: "Campos obrigatórios não preenchidos" }, { status: 400 });
  }

  // Se adminEmail fornecido, verificar duplicidade
  if (adminEmail) {
    const existingUserEmail = await prisma.user.findFirst({ where: { email: adminEmail.toLowerCase().trim() } });
    if (existingUserEmail) {
      return NextResponse.json({ error: "Email do administrador já está em uso por outro usuário" }, { status: 400 });
    }
  }

  // Verificar CNPJ duplicado
  const cleanCnpj = cnpj.replace(/\D/g, "");
  const existingCnpj = await prisma.company.findFirst({ where: { cnpj: cleanCnpj } });
  if (existingCnpj) {
    return NextResponse.json({ error: "CNPJ já cadastrado no sistema" }, { status: 400 });
  }

  // Verificar email duplicado
  const existingEmail = await prisma.company.findFirst({ where: { email } });
  if (existingEmail) {
    return NextResponse.json({ error: "Email já cadastrado no sistema" }, { status: 400 });
  }

  // Buscar plano
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    return NextResponse.json({ error: "Plano não encontrado" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar Network se necessário
      let networkId: string | null = null;
      let isHeadquarters = false;

      if (isNetwork && networkMode === "new" && newNetworkName) {
        const network = await tx.network.create({
          data: {
            name: newNetworkName,
            slug: generateSlug(newNetworkName),
            sharedCatalog: true,
            sharedPricing: true,
            sharedSuppliers: true,
          },
        });
        networkId = network.id;
        isHeadquarters = true;
      } else if (isNetwork && networkMode === "existing" && existingNetworkId) {
        networkId = existingNetworkId;
        isHeadquarters = false;
      }

      // 2. Gerar slug único
      let slug = generateSlug(tradeName);
      const existingSlug = await tx.company.findFirst({ where: { slug } });
      if (existingSlug) {
        slug = `${slug}-${Date.now()}`;
      }

      // 3. Criar Company
      const company = await tx.company.create({
        data: {
          name: companyName || tradeName,
          tradeName,
          cnpj: cleanCnpj,
          email,
          phone,
          website: null,
          address: address || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          slug,
          networkId,
          isHeadquarters,
          onboardingStatus: "PENDING_INVITE",
          leadSource: acquisitionChannel || null,
          maxUsers: plan.maxUsers || 3,
          maxProducts: plan.maxProducts || 500,
          maxBranches: plan.maxBranches || 1,
          healthScore: 50,
          healthCategory: "HEALTHY",
        },
      });

      // 4. Atualizar headquarters se nova rede
      if (isHeadquarters && networkId) {
        await tx.network.update({
          where: { id: networkId },
          data: { headquartersId: company.id },
        });
      }

      // 5. Criar Branch (Matriz)
      const branch = await tx.branch.create({
        data: {
          companyId: company.id,
          name: `${tradeName} - Matriz`,
          phone: phone || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          address: address || null,
        },
      });

      // 6. Criar User admin da ótica (se dados fornecidos)
      let user = null;
      if (adminEmail && adminPassword && adminName) {
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        user = await tx.user.create({
          data: {
            companyId: company.id,
            name: adminName.trim(),
            email: adminEmail.toLowerCase().trim(),
            passwordHash,
            role: "ADMIN",
            active: true,
          },
        });

        // 6b. Vincular user à branch
        await tx.userBranch.create({
          data: {
            userId: user.id,
            branchId: branch.id,
          },
        });

        // Marcar empresa como acessível e pular onboarding (admin já configurou)
        await tx.company.update({
          where: { id: company.id },
          data: {
            accessEnabled: true,
            accessEnabledAt: new Date(),
            onboardingStatus: "ACTIVE",
            onboardingStep: 4,
            onboardingDoneAt: new Date(),
          },
        });
      }

      // 7. Criar Subscription
      const now = new Date();
      const trialEnd = new Date(now.getTime() + (trialDays || 14) * 24 * 60 * 60 * 1000);

      await tx.subscription.create({
        data: {
          companyId: company.id,
          planId,
          status: (trialDays || 0) > 0 ? "TRIAL" : "ACTIVE",
          billingCycle: billingCycle || "MONTHLY",
          trialStartedAt: (trialDays || 0) > 0 ? now : null,
          trialEndsAt: (trialDays || 0) > 0 ? trialEnd : null,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
          discountPercent: discountPercent || null,
        },
      });

      // 8. Criar Invite (mantém para fluxo de ativação por email)
      const inviteToken = randomBytes(32).toString("hex");
      const invite = await tx.invite.create({
        data: {
          companyId: company.id,
          email: ownerEmail,
          name: ownerName,
          role: "admin",
          token: inviteToken,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 dias
          createdById: admin.id,
          createdByName: admin.name,
          // Se user já criado, marcar invite como ativado
          ...(user ? { status: "ACTIVATED" as const, activatedAt: now, activatedUserId: user.id } : {}),
        },
      });

      // 9. Adicionar à fila de email
      if (sendInviteEmail && !user) {
        await tx.emailQueue.create({
          data: {
            to: ownerEmail,
            subject: `Bem-vindo ao PDV Ótica - Ative sua conta`,
            template: "invite",
            data: {
              name: ownerName,
              companyName: tradeName,
              activationUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/activate?token=${inviteToken}`,
              expiresAt: invite.expiresAt.toISOString(),
            },
          },
        });

        if (!user) {
          await tx.company.update({
            where: { id: company.id },
            data: { onboardingStatus: "INVITE_SENT" },
          });
        }
      }

      // 10. Criar nota se houver observações
      if (notes) {
        await tx.companyNote.create({
          data: {
            companyId: company.id,
            adminId: admin.id,
            adminName: admin.name,
            content: notes,
            type: "onboarding",
          },
        });
      }

      // 11. Auditoria
      await tx.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          companyId: company.id,
          action: "COMPANY_CREATED",
          metadata: {
            planId,
            trialDays,
            isNetwork,
            networkId,
            inviteId: invite.id,
            sendInviteEmail,
            adminUserCreated: !!user,
            adminEmail: user?.email || null,
          },
        },
      });

      return { company, invite, user, branch };
    });

    return NextResponse.json({
      success: true,
      company: result.company,
      inviteId: result.invite.id,
      adminUserCreated: !!result.user,
      adminEmail: result.user?.email || null,
    });
  } catch (error: any) {
    console.error("[CREATE_CLIENT]", error);

    // Tratar erro de unique constraint
    if (error.code === "P2002") {
      const field = error.meta?.target?.[0];
      if (field === "cnpj") {
        return NextResponse.json({ error: "CNPJ já cadastrado" }, { status: 400 });
      }
      if (field === "slug") {
        return NextResponse.json({ error: "Nome já existe no sistema" }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Erro ao cadastrar cliente" }, { status: 500 });
  }
}
