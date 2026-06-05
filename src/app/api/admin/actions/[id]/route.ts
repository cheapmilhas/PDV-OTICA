// src/app/api/admin/actions/[id]/route.ts
//
// Rota de EXECUÇÃO do motor de ações do admin — é o portão de segurança das 8
// ações destrutivas (bloquear/cancelar/excluir empresas). Sequência obrigatória:
//   1. requireAdminAuth() — só AdminUser autenticado passa (401 caso contrário)
//   2. validateActionRequest() — enforce allowedRoles (403) + schema (400) +
//      confirmação (motivo / typeToConfirm). É o ÚNICO portão de role; bp.execute
//      SÓ é chamado se este retornar ok:true.
//   3. bp.execute() — com ctx.adminName/adminEmail vindos da session (fidelidade
//      da auditoria globalAudit/logActivity).
//   4. AdminActionLog — 3ª trilha de auditoria, do próprio motor.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/admin-auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { getBlueprint } from "@/lib/admin-actions/registry";
import { validateActionRequest } from "@/lib/admin-actions/validate";
import { readRequestId } from "@/lib/observability/request-context";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    // 1. Auth primeiro. requireAdminAuth lança Error com .status 401/403 — que o
    // handleApiError NÃO lê (mapearia pra 500). Por isso tratamos aqui, honrando
    // o status do erro de auth.
    let session;
    try {
      session = await requireAdminAuth();
    } catch (authError: unknown) {
      const status =
        typeof authError === "object" &&
        authError !== null &&
        "status" in authError &&
        typeof (authError as { status: unknown }).status === "number"
          ? (authError as { status: number }).status
          : 401;
      const message = authError instanceof Error ? authError.message : "Não autorizado";
      return NextResponse.json(
        { error: { code: status === 403 ? "FORBIDDEN" : "UNAUTHORIZED", message } },
        { status },
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
      role: session.user.role,
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
        adminId: session.user.id,
        adminName: session.user.name,
        adminEmail: session.user.email,
        requestId,
      },
      v.input,
    );

    // 4. 3ª trilha de auditoria: o log do motor de ações (adicional ao
    // globalAudit+logActivity do execute).
    await prisma.adminActionLog.create({
      data: {
        adminId: session.user.id,
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
