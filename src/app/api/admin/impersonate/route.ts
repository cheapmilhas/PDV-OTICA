import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { encode } from "next-auth/jwt";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimitResponse, clientIp } from "@/lib/rate-limit";

const log = logger.child({ route: "admin/impersonate" });

const IMPERSONATION_TTL_MS = 30 * 60 * 1000; // 30 minutos

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

  const limited = rateLimitResponse(`admin-impersonate:${admin.id}:${clientIp(request)}`, {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return limited;

  try {
    const body = await request.json();
    const { companyId, reason } = impersonateSchema.parse(body);

    const scoped = await requireCompanyScope(admin.id, companyId);
    if (!scoped) {
      await prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          companyId: null,
          action: "IMPERSONATION_DENIED",
          metadata: {
            attemptedCompanyId: companyId,
            reason: "fora de escopo ou admin inativo",
            adminEmail: admin.email,
          },
        },
      });
      return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
    }

    // Buscar empresa e seu primeiro usuário admin/owner
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    // Buscar o user ADMIN MAIS ANTIGO da empresa para impersonar.
    // orderBy é obrigatório: sem ele, findFirst é não-determinístico quando há
    // múltiplos admins (podia impersonar um usuário diferente a cada clique).
    const targetUser = await prisma.user.findFirst({
      where: { companyId, role: "ADMIN", active: true },
      include: {
        branches: {
          include: { branch: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!targetUser || !targetUser.branches[0]) {
      return NextResponse.json(
        { error: "Empresa não possui usuário admin ativo com filial" },
        { status: 400 }
      );
    }

    // Defesa em profundidade: garante que o usuário-alvo realmente pertence à
    // empresa solicitada e que a filial é da mesma empresa. Evita impersonar a
    // empresa errada caso haja dados inconsistentes (usuário/filial cruzados).
    if (
      targetUser.companyId !== companyId ||
      targetUser.branches[0].branch.companyId !== companyId
    ) {
      log.error("Inconsistência: targetUser/filial não pertencem à empresa", {
        companyId,
        targetUserId: targetUser.id,
        targetUserCompanyId: targetUser.companyId,
        branchCompanyId: targetUser.branches[0].branch.companyId,
      });
      return NextResponse.json(
        { error: "Inconsistência de dados ao preparar acesso. Contate o suporte." },
        { status: 409 }
      );
    }

    const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);

    // Q8.3: encerra sessões de impersonação ANTERIORES ainda abertas deste admin
    // e cria a nova ATOMICAMENTE. Junto com a revogação no jwt callback
    // (auth.ts), garante que só a sessão mais recente fica válida (tokens antigos
    // viram inválidos no próximo acesso, sem esperar o TTL de 30min). A transação
    // evita o estado parcial "fechei as antigas mas a nova falhou".
    const session = await prisma.$transaction(async (tx) => {
      await tx.impersonationSession.updateMany({
        where: { adminUserId: admin.id, endedAt: null },
        data: { endedAt: new Date() },
      });
      return tx.impersonationSession.create({
        data: {
          adminUserId: admin.id,
          companyId,
          reason,
          expiresAt,
          ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
          userAgent: request.headers.get("user-agent") || null,
        },
      });
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
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET não configurado");

    const sessionToken = await encode({
      token: tokenPayload,
      secret,
      salt: "next-auth.session-token",
      // Alinha o `exp` do JWT ao TTL de impersonação (30 min). Sem isso o
      // @auth/core usa o DEFAULT_MAX_AGE de 30 dias — um token vazado sobreviveria
      // muito além da sessão, dependendo apenas da revogação por DB.
      maxAge: Math.floor(IMPERSONATION_TTL_MS / 1000),
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
    const message = error instanceof Error ? error.message : String(error);
    log.error("Erro", { error: message, stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json({ error: "Erro interno", details: message }, { status: 500 });
  }
}
