import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  const { token, password, acceptTerms } = await request.json();

  if (!token || !password || !acceptTerms) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Senha deve ter no mínimo 8 caracteres" }, { status: 400 });
  }

  // Buscar convite
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { company: true },
  });

  if (!invite) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  }

  if (invite.status !== "PENDING") {
    return NextResponse.json({ error: "Este convite já foi utilizado ou cancelado" }, { status: 400 });
  }

  if (new Date() > invite.expiresAt) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "Este convite expirou" }, { status: 400 });
  }

  // Hash da senha
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar usuário
      const user = await tx.user.create({
        data: {
          companyId: invite.companyId,
          name: invite.name,
          email: invite.email,
          passwordHash,
          role: "ADMIN",
        },
      });

      // 2. Criar ou buscar filial principal
      let branch = await tx.branch.findFirst({
        where: { companyId: invite.companyId },
      });

      if (!branch) {
        branch = await tx.branch.create({
          data: {
            companyId: invite.companyId,
            name: (invite.company.tradeName || "Matriz") + " - Matriz",
          },
        });
      }

      // 3. Vincular usuário à filial
      await tx.userBranch.create({
        data: {
          userId: user.id,
          branchId: branch.id,
        },
      });

      // 4. Atualizar convite
      await tx.invite.update({
        where: { id: invite.id },
        data: {
          status: "ACTIVATED",
          activatedAt: new Date(),
          activatedUserId: user.id,
        },
      });

      // 5. Ativar empresa
      await tx.company.update({
        where: { id: invite.companyId },
        data: {
          accessEnabled: true,
          accessEnabledAt: new Date(),
          onboardingStatus: "ACTIVE",
          onboardingCompletedAt: new Date(),
        },
      });

      // 6. Auditoria
      await tx.globalAudit.create({
        data: {
          actorType: "USER",
          actorId: user.id,
          companyId: invite.companyId,
          action: "ACCOUNT_ACTIVATED",
          metadata: { inviteId: invite.id },
        },
      });

      return user;
    });

    return NextResponse.json({
      success: true,
      message: "Conta ativada com sucesso!",
      userId: result.id,
    });
  } catch (error) {
    console.error("[ACTIVATE]", error);
    return NextResponse.json({ error: "Erro ao ativar conta" }, { status: 500 });
  }
}
