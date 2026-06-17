import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/ai-toggle-all
 * Ação em massa do super-admin: liga/desliga a disponibilidade da IA
 * (flag iaAvailable) para TODAS as óticas de uma vez.
 * Não cria nenhuma Company; apenas atualiza company_settings existentes.
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  const body = await request.json();
  if (typeof body.iaAvailable !== "boolean") {
    return NextResponse.json({ error: "iaAvailable (boolean) é obrigatório" }, { status: 400 });
  }

  const result = await prisma.companySettings.updateMany({ data: { iaAvailable: body.iaAvailable } });
  return NextResponse.json({ data: { updated: result.count } });
}
