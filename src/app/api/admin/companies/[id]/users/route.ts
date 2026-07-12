import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/logger";
import { normalizeLoginEmail } from "@/lib/normalize-login";
import { normalizeRecoveryEmail } from "@/services/user.service";

const log = logger.child({ route: "admin/companies/[id]/users" });

/**
 * GET /api/admin/companies/[id]/users
 * Lista todos os usuários de uma empresa
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId } = await context.params;

  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      tradeName: true,
      name: true,
      maxUsers: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          plan: { select: { name: true, maxUsers: true } },
        },
      },
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      email: true,
      recoveryEmail: true,
      role: true,
      active: true,
      createdAt: true,
      branches: {
        select: {
          branch: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const plan = company.subscriptions[0]?.plan ?? null;

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      branches: u.branches.map((ub) => ub.branch),
    })),
    meta: {
      total: users.length,
      maxUsers: plan?.maxUsers ?? company.maxUsers ?? 999,
      planName: plan?.name ?? "Sem plano",
    },
  });
}

const createUserSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  email: z.string().min(1, "Login obrigatório"),
  recoveryEmail: z.string().trim().email("Email de recuperação inválido").or(z.literal("")).nullable().optional(),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  role: z.enum(["ADMIN", "GERENTE", "VENDEDOR", "CAIXA", "ATENDENTE"]),
  branchId: z.string().optional(),
});

/**
 * POST /api/admin/companies/[id]/users
 * Cria um novo usuário para a empresa
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId } = await context.params;

  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, password, role, branchId } = parsed.data;
  // Normaliza o login UMA vez: sem "@" → "<valor>@login"; com "@" → minúsculo+trim.
  // A partir daqui `email` já está normalizado — não re-aplicar toLowerCase/trim.
  const email = normalizeLoginEmail(parsed.data.email);

  // Verificar se empresa existe
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      maxUsers: true,
      tradeName: true,
      name: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { plan: { select: { maxUsers: true } } },
      },
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  // Verificar limite de usuários
  const activeUsers = await prisma.user.count({
    where: { companyId, active: true },
  });
  const maxUsers = company.subscriptions[0]?.plan?.maxUsers ?? company.maxUsers ?? 999;
  // maxUsers === -1 significa ilimitado (mesma convenção de plan-limits.ts).
  // Sem este guard, `activeUsers >= -1` é sempre verdadeiro e trava a criação
  // de usuários em planos ilimitados.
  if (maxUsers !== -1 && activeUsers >= maxUsers) {
    return NextResponse.json(
      { error: `Limite de ${maxUsers} usuários atingido. Faça upgrade do plano.` },
      { status: 400 }
    );
  }

  // Verificar email duplicado DENTRO da empresa (Q8.4: email é único por-empresa,
  // não global — o mesmo email pode existir em outra ótica).
  const existingUser = await prisma.user.findFirst({
    where: {
      companyId,
      email: { equals: email, mode: "insensitive" },
    },
  });
  if (existingUser) {
    return NextResponse.json({ error: "Este email já está em uso" }, { status: 400 });
  }

  // Buscar branch (usar primeira da empresa se não especificada).
  let targetBranchId: string | null = null;
  if (branchId) {
    // branchId veio do body — validar que é uma filial DESTA empresa, senão
    // um branchId arbitrário vincularia o usuário a filial de outro tenant
    // (UserBranch inconsistente ou violação de FK → 500 genérico).
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, companyId },
      select: { id: true },
    });
    if (!branch) {
      return NextResponse.json(
        { error: "Filial inválida para esta empresa" },
        { status: 400 }
      );
    }
    targetBranchId = branch.id;
  } else {
    const branch = await prisma.branch.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    });
    targetBranchId = branch?.id || null;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      // Se empresa não tem branch, criar Matriz automaticamente
      let finalBranchId = targetBranchId;
      if (!finalBranchId) {
        const newBranch = await tx.branch.create({
          data: {
            companyId,
            name: `${company.tradeName || company.name} - Matriz`,
          },
        });
        finalBranchId = newBranch.id;
      }

      const newUser = await tx.user.create({
        data: {
          companyId,
          name: name.trim(),
          email,
          recoveryEmail: normalizeRecoveryEmail(parsed.data.recoveryEmail),
          passwordHash,
          role: role as any,
          active: true,
        },
      });

      await tx.userBranch.create({
        data: {
          userId: newUser.id,
          branchId: finalBranchId,
        },
      });

      // Auditoria
      await tx.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          companyId,
          action: "USER_CREATED",
          metadata: {
            userId: newUser.id,
            userEmail: newUser.email,
            role,
            source: "admin_portal",
          },
        },
      });

      return newUser;
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
      },
    }, { status: 201 });
  } catch (error: any) {
    log.error("Erro ao criar usuário", { error: error instanceof Error ? error.message : String(error) });
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Email já em uso" }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao criar usuário" }, { status: 500 });
  }
}
