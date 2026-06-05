// src/app/api/admin/actions/route.ts
//
// Lista os blueprints disponíveis (descritores serializáveis) para a UI montar os
// modais. Filtra pelos que o role do admin pode executar — a UI não mostra o que o
// usuário não pode rodar (a rota executora revalida o role de qualquer forma).
import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { actionRegistry } from "@/lib/admin-actions/registry";
import { describeBlueprint } from "@/lib/admin-actions/describe-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireAdminAuth();
    const role = session.user.role;

    const blueprints = Object.values(actionRegistry)
      .filter((bp) => bp.allowedRoles.includes(role))
      .map(describeBlueprint);

    return NextResponse.json({ data: blueprints });
  } catch (error) {
    return handleApiError(error);
  }
}
