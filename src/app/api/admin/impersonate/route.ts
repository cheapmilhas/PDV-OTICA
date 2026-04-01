import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { encode } from "next-auth/jwt";
import { z } from "zod";

const impersonateSchema = z.object({
  companyId: z.string().min(1, "companyId é obrigatório"),
  reason: z.string().min(1, "Motivo é obrigatório"),
});

/**
 * POST /api/admin/impersonate
 * Cria uma sessão de impersonação — gera token para acessar PDV como empresa
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão para impersonar" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { companyId, reason } = impersonateSchema.parse(body);

    // Buscar empresa e seu primeiro usuário admin/owner
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    // Buscar o primeiro user ADMIN da empresa para impersonar
    const targetUser = await prisma.user.findFirst({
      where: { companyId, role: "ADMIN", active: true },
      include: {
        branches: {
          include: { branch: true },
          take: 1,
        },
      },
    });

    if (!targetUser || !targetUser.branches[0]) {
      return NextResponse.json(
        { error: "Empresa não possui usuário admin ativo com filial" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 horas

    // Criar sessão de impersonação
    const session = await prisma.impersonationSession.create({
      data: {
        adminUserId: admin.id,
        companyId,
        reason,
        expiresAt,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
        userAgent: request.headers.get("user-agent") || null,
      },
    });

    // Montar payload com TODOS os campos que o callback jwt do auth.ts adiciona
    const tokenPayload = {
      sub: targetUser.id,
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      branchId: targetUser.branches[0].branchId,
      companyId,
      networkId: null as string | null,
      impersonation: {
        sessionId: session.id,
        adminId: admin.id,
        adminName: admin.name,
        adminEmail: admin.email,
      },
    };

    // Gerar token compatível com NextAuth v5 (usa encode do next-auth/jwt)
    const sessionToken = await encode({
      token: tokenPayload,
      secret: process.env.AUTH_SECRET!,
      salt: "next-auth.session-token",
    });

    // Registrar auditoria
    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId,
        action: "IMPERSONATION_STARTED",
        metadata: {
          sessionId: session.id,
          companyName: company.name,
          targetUserId: targetUser.id,
          reason,
          adminEmail: admin.email,
        },
      },
    });

    return NextResponse.json({
      data: {
        sessionId: session.id,
        token: sessionToken,
        expiresAt: expiresAt.toISOString(),
        companyName: company.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 400 });
    }
    console.error("[ADMIN-IMPERSONATE] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
