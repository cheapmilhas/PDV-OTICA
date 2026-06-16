import { NextResponse } from "next/server";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/admin/companies/[id]/ai-settings
 * Atualiza flags de IA da empresa: iaAvailable, iaEnabled, iaMonthlyTokenLimit.
 * Requer sessão de admin + escopo sobre a empresa.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;

  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });

  const body = await request.json();

  // Only write fields that are explicitly present in the body
  const update: {
    iaAvailable?: boolean;
    iaEnabled?: boolean;
    iaMonthlyTokenLimit?: number | null;
    markupPercentOverride?: number | null;
  } = {};

  if (typeof body.iaAvailable === "boolean") update.iaAvailable = body.iaAvailable;
  if (typeof body.iaEnabled === "boolean") update.iaEnabled = body.iaEnabled;
  if ("iaMonthlyTokenLimit" in body) {
    const v = body.iaMonthlyTokenLimit;
    if (v === null || typeof v === "number") update.iaMonthlyTokenLimit = v;
  }
  // markupPercentOverride: null limpa o override (cai no markup global); number define.
  // Sem guard >= 0 — margem negativa é subsídio válido. Prisma aceita JS number num Decimal?.
  if ("markupPercentOverride" in body) {
    const v = body.markupPercentOverride;
    if (v === null || typeof v === "number") update.markupPercentOverride = v;
  }

  const data = await prisma.companySettings.upsert({
    where: { companyId },
    update,
    create: { companyId, ...update },
  });

  return NextResponse.json({ data });
}
