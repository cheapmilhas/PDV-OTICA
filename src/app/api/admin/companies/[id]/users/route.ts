import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

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
  email: z.string().email("Email inválido"),
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

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, email, password, role, branchId } = parsed.data;

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
  if (activeUsers >= maxUsers) {
    return NextResponse.json(
      { error: `Limite de ${maxUsers} usuários atingido. Faça upgrade do plano.` },
      { status: 400 }
    );
  }

  // Verificar email duplicado
  const existingUser = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim() } });
  if (existingUser) {
    return NextResponse.json({ error: "Este email já está em uso" }, { status: 400 });
  }

  // Buscar branch (usar primeira da empresa se não especificada)
  let targetBranchId: string | null = branchId || null;
  if (!targetBranchId) {
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
          email: email.toLowerCase().trim(),
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
    console.error("[CREATE_USER]", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Email já em uso" }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao criar usuário" }, { status: 500 });
  }
}
