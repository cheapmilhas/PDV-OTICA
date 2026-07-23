import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { setupCompanyFinance } from "@/services/finance-setup.service";
import { logActivity } from "@/services/activity-log.service";
import { createOnboardingChecklist, completeOnboardingStep } from "@/services/onboarding-checklist.service";
import { ActorType } from "@prisma/client";
import { logger } from "@/lib/logger";
import { containsHtml } from "@/lib/validations/safe-text";
import { resolveProvisionProduct } from "../provision-product";

const log = logger.child({ route: "admin/clientes/create" });

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
  // Provisionar ótica nova + owner (com senha) é ação de dono — mín. ADMIN.
  // SUPPORT/BILLING não criam empresas arbitrárias.
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
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
    // Vis Medical (F0) — produto e vínculo por titularidade
    platformProduct: rawPlatformProduct,
    ownerGroupId,
  } = body;

  // Validações
  if (!tradeName || !cnpj || !email || !city || !state || !ownerName || !ownerEmail || !planId) {
    return NextResponse.json({ error: "Campos obrigatórios não preenchidos" }, { status: 400 });
  }

  // Vis Medical (F0): normaliza o produto e decide se roda o finance setup de ótica.
  // Ausente → VIS_APP (compat); presente e inválido → 400 (nunca classificar conta
  // silenciosamente no produto errado).
  const provision = resolveProvisionProduct(rawPlatformProduct);
  if (!provision) {
    return NextResponse.json(
      { error: "platformProduct inválido (use VIS_APP ou VIS_MEDICAL)" },
      { status: 400 },
    );
  }

  // SEGURANÇA: rejeitar HTML em campos de texto livre que vão para o banco
  // (XSS/clickjacking armazenado em Company/Branch/Network/Note).
  for (const [label, value] of [
    ["Nome fantasia", tradeName],
    ["Razão social", companyName],
    ["Nome do responsável", ownerName],
    ["Nome da rede", newNetworkName],
    ["Observações", notes],
  ] as const) {
    if (typeof value === "string" && value && (value.length > 200 || containsHtml(value))) {
      return NextResponse.json(
        { error: `${label} inválido (não pode conter HTML)` },
        { status: 400 }
      );
    }
  }

  // Se adminEmail fornecido, verificar duplicidade.
  // NOTA (Q8.4): checagem GLOBAL é INTENCIONAL aqui — este fluxo provisiona uma
  // ÓTICA NOVA (super-admin) e seu owner; ainda não há companyId. Mesmo com email
  // único por-empresa, bloquear reuso global de email do owner na criação evita
  // ambiguidade (qual conta seria dona da nova empresa). Igual ao /public/register.
  if (adminEmail) {
    const existingUserEmail = await prisma.user.findFirst({ where: { email: { equals: adminEmail.toLowerCase().trim(), mode: "insensitive" } } });
    if (existingUserEmail) {
      return NextResponse.json({ error: "Email do administrador já está em uso por outro usuário" }, { status: 400 });
    }
  }

  // CNPJ obrigatório (DEC-2): a checagem de truthiness acima roda no valor CRU, mas
  // entradas como "." ou "   " passam e viram string vazia após remover não-dígitos.
  // Sem esta validação, criaríamos uma Company com cnpj="" (estado inválido).
  const cleanCnpj = cnpj.replace(/\D/g, "");
  if (cleanCnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido (14 dígitos)" }, { status: 400 });
  }

  // Verificar CNPJ duplicado
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

  // Integridade produto×plano: o plano tem que ser do MESMO produto da empresa.
  // Defesa de servidor — o form persiste planId no draft e apenas esconder planos
  // incompatíveis não impede um planId antigo de chegar aqui (achado do Codex).
  // Sem isto, uma empresa VIS_MEDICAL poderia nascer com plano ótico (ou vice-versa),
  // quebrando MRR/segmentação e o funil de cobrança.
  if (plan.platformProduct !== provision.platformProduct) {
    return NextResponse.json(
      { error: "O plano selecionado não pertence ao produto escolhido" },
      { status: 400 },
    );
  }

  // Vis Medical (F0): se vier vínculo por titularidade, validar existência antes da transação.
  if (ownerGroupId) {
    const group = await prisma.companyOwnerGroup.findUnique({ where: { id: ownerGroupId } });
    if (!group) {
      return NextResponse.json({ error: "Grupo de titularidade inexistente" }, { status: 400 });
    }
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
          // Health score só faz sentido para ótica (derivado de sinais do PDV).
          // Medical nasce SEM score (null) em vez de um "50/HEALTHY" fictício que
          // vazaria na lista/dashboard como falso churn-risk.
          healthScore: provision.platformProduct === "VIS_APP" ? 50 : null,
          healthCategory: provision.platformProduct === "VIS_APP" ? "HEALTHY" : null,
          platformProduct: provision.platformProduct,
          ownerGroupId: ownerGroupId ?? null,
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

      // 7.0. Criar CompanySettings com dados cadastrais
      await tx.companySettings.create({
        data: {
          companyId: company.id,
          displayName: tradeName || companyName,
          cnpj: cleanCnpj || null,
          phone: phone || null,
          email: email || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
        },
      });

      // 7.1. Configurar módulo financeiro (só ótica / Vis App).
      // Q4.4: erro AQUI propaga para rollback da transação inteira — admin
      // refaz o cadastro em vez de ficar com company em estado inconsistente
      // (sem chartOfAccounts/FinanceAccount, quebra venda/orçamento depois).
      // Vis Medical (F0): pula o finance setup de ótica (não faz sentido no produto clínico).
      if (provision.runOpticalFinanceSetup) {
        await setupCompanyFinance(tx, company.id, branch?.id);
      }

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

    // Pós-transaction: checklist, activity log (falha silenciosa)
    await createOnboardingChecklist(result.company.id);

    // Marca steps já concluídos pela criação
    await completeOnboardingStep(result.company.id, "COMPANY_DATA", admin.id);
    await completeOnboardingStep(result.company.id, "PLAN_SELECTED", admin.id);
    if (result.branch) {
      await completeOnboardingStep(result.company.id, "FIRST_BRANCH", admin.id);
    }
    if (result.user) {
      await completeOnboardingStep(result.company.id, "FIRST_USER", admin.id);
    }

    await logActivity({
      companyId: result.company.id,
      type: "COMPANY_CREATED",
      title: "Empresa criada",
      detail: { planId, trialDays, adminEmail: result.user?.email ?? null },
      actorId: admin.id,
      actorType: ActorType.ADMIN,
      actorName: admin.name,
    });

    return NextResponse.json({
      success: true,
      company: result.company,
      inviteId: result.invite.id,
      adminUserCreated: !!result.user,
      adminEmail: result.user?.email || null,
    });
  } catch (error: any) {
    log.error("Erro ao criar cliente", { error: error instanceof Error ? error.message : String(error) });

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
