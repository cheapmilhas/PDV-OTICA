// src/app/api/admin/actions/route.ts
//
// Lista os blueprints disponíveis (descritores serializáveis) para a UI montar os
// modais. Filtra pelos que o role do admin pode executar — a UI não mostra o que o
// usuário não pode rodar (a rota executora revalida o role de qualquer forma).
import { NextResponse } from "next/server";
import { AdminRole } from "@prisma/client";
import { getAdminSession } from "@/lib/admin-session";
import { handleApiError } from "@/lib/error-handler";
import { actionRegistry } from "@/lib/admin-actions/registry";
import { describeBlueprint } from "@/lib/admin-actions/describe-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Lê o cookie de sessão admin (jose) — MESMO leitor de /api/admin/plans e
    // impersonate. (Antes usava requireAdminAuth/authAdmin, que nunca acha sessão
    // porque o login não usa NextAuth → 401 → blueprints vazios → modal não abria.)
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Não autorizado" } },
        { status: 401 },
      );
    }
    const role = admin.role as AdminRole;

    const blueprints = Object.values(actionRegistry)
      .filter((bp) => bp.allowedRoles.includes(role))
      .map(describeBlueprint);

    return NextResponse.json({ data: blueprints });
  } catch (error) {
    return handleApiError(error);
  }
}
