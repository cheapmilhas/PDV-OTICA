// src/app/api/admin/actions/[id]/route.ts
//
// Rota de EXECUÇÃO do motor de ações do admin — é o portão de segurança das 8
// ações destrutivas (bloquear/cancelar/excluir empresas). Sequência obrigatória:
//   1. getAdminSession() — lê o cookie admin.session-token (JWT jose) gravado
//      pelo login admin. MESMO leitor usado por /api/admin/plans e impersonate.
//      (NÃO usar requireAdminAuth/authAdmin: o login não cria sessão NextAuth,
//      então aquele helper retorna 401 sempre — era a causa de "ações não
//      funcionam": GET /actions dava 401, blueprints vinham vazios, modal não
//      abria.)
//   2. validateActionRequest() — enforce allowedRoles (403) + schema (400) +
//      confirmação (motivo / typeToConfirm). É o ÚNICO portão de role; bp.execute
//      SÓ é chamado se este retornar ok:true.
//   3. bp.execute() — com ctx.adminName/adminEmail vindos da session (fidelidade
//      da auditoria globalAudit/logActivity).
//   4. AdminActionLog — 3ª trilha de auditoria, do próprio motor.
import { NextRequest, NextResponse } from "next/server";
import { Prisma, AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { handleApiError } from "@/lib/error-handler";
import { getBlueprint } from "@/lib/admin-actions/registry";
import { validateActionRequest } from "@/lib/admin-actions/validate";
import { readRequestId } from "@/lib/observability/request-context";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    // 1. Auth primeiro: lê o cookie de sessão admin (jose). Sem sessão → 401.
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Não autorizado" } },
        { status: 401 },
      );
    }

    const { id } = await ctx.params;
    const bp = getBlueprint(id);
    if (!bp) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Ação desconhecida" } },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestId = readRequestId(req.headers);

    // empresa-alvo (p/ typeToConfirm e auditoria)
    const targetCompanyId = bp.targetCompanyId?.(body.input) ?? null;
    let companyName: string | undefined;
    if (targetCompanyId) {
      const c = await prisma.company.findUnique({
        where: { id: targetCompanyId },
        select: { name: true },
      });
      companyName = c?.name;
    }

    // 2. Portão de segurança: allowedRoles + schema + confirmação. bp.execute SÓ
    // roda se v.ok === true.
    const v = validateActionRequest(bp, {
      role: admin.role as AdminRole,
      input: body.input,
      reason: body.reason,
      companyName,
      confirmName: body.confirmName,
    });
    if (!v.ok) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: v.message } },
        { status: v.status },
      );
    }

    // 3. Executa, com identidade do admin vinda da session.
    const result = await bp.execute(
      {
        adminId: admin.id,
        adminName: admin.name,
        adminEmail: admin.email,
        requestId,
      },
      v.input,
    );

    // 4. 3ª trilha de auditoria: o log do motor de ações (adicional ao
    // globalAudit+logActivity do execute).
    await prisma.adminActionLog.create({
      data: {
        adminId: admin.id,
        actionId: bp.id,
        companyId: targetCompanyId,
        riskLevel: bp.riskLevel,
        input: (body.input ?? {}) as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
        reason: body.reason ?? null,
        requestId,
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
