import { NextResponse } from "next/server";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { WA_BOUNDS } from "@/services/whatsapp-config.service";

/**
 * GET/PATCH /api/admin/companies/[id]/whatsapp-limits
 *
 * Override das travas anti-bloqueio POR ÓTICA (super admin). null em qualquer
 * campo = limpa o override (a ótica volta a usar o global). Requer sessão de
 * admin + escopo sobre a empresa. A ótica NÃO acessa isto.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;
  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });

  const s = await prisma.companySettings.findUnique({
    where: { companyId },
    select: {
      waOpenHourOverride: true,
      waCloseHourOverride: true,
      waDailyCapOverride: true,
      waSkipSaturdayOverride: true,
    },
  });

  return NextResponse.json({
    data: {
      openHourOverride: s?.waOpenHourOverride ?? null,
      closeHourOverride: s?.waCloseHourOverride ?? null,
      dailyCapOverride: s?.waDailyCapOverride ?? null,
      skipSaturdayOverride: s?.waSkipSaturdayOverride ?? null,
    },
  });
}

/** Valida um override individual (number) contra os bounds. null é sempre ok (limpa). */
function boundError(field: string, v: number): string | null {
  if (field === "openHour" && (v < WA_BOUNDS.openHourMin || v > WA_BOUNDS.openHourMax)) {
    return `Hora de abertura deve estar entre ${WA_BOUNDS.openHourMin} e ${WA_BOUNDS.openHourMax}.`;
  }
  if (field === "closeHour" && (v < WA_BOUNDS.closeHourMin || v > WA_BOUNDS.closeHourMax)) {
    return `Hora de fechamento deve estar entre ${WA_BOUNDS.closeHourMin} e ${WA_BOUNDS.closeHourMax}.`;
  }
  if (field === "dailyCap" && (v < WA_BOUNDS.dailyCapMin || v > WA_BOUNDS.dailyCapMax)) {
    return `Teto diário deve estar entre ${WA_BOUNDS.dailyCapMin} e ${WA_BOUNDS.dailyCapMax}.`;
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;
  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });

  const body = await request.json();

  const update: {
    waOpenHourOverride?: number | null;
    waCloseHourOverride?: number | null;
    waDailyCapOverride?: number | null;
    waSkipSaturdayOverride?: boolean | null;
  } = {};

  // Para cada campo: presente no body? null limpa o override; number valida bounds.
  if ("openHourOverride" in body) {
    const v = body.openHourOverride;
    if (v === null) update.waOpenHourOverride = null;
    else if (typeof v === "number") {
      const e = boundError("openHour", v);
      if (e) return NextResponse.json({ error: e }, { status: 400 });
      update.waOpenHourOverride = v;
    }
  }
  if ("closeHourOverride" in body) {
    const v = body.closeHourOverride;
    if (v === null) update.waCloseHourOverride = null;
    else if (typeof v === "number") {
      const e = boundError("closeHour", v);
      if (e) return NextResponse.json({ error: e }, { status: 400 });
      update.waCloseHourOverride = v;
    }
  }
  if ("dailyCapOverride" in body) {
    const v = body.dailyCapOverride;
    if (v === null) update.waDailyCapOverride = null;
    else if (typeof v === "number") {
      const e = boundError("dailyCap", v);
      if (e) return NextResponse.json({ error: e }, { status: 400 });
      update.waDailyCapOverride = v;
    }
  }
  if ("skipSaturdayOverride" in body) {
    const v = body.skipSaturdayOverride;
    if (v === null || typeof v === "boolean") update.waSkipSaturdayOverride = v;
  }

  // Coerência: se ambos os horários ficam definidos (override), fechamento > abertura.
  // Considera o estado resultante (override novo OU o que já está salvo).
  const current = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { waOpenHourOverride: true, waCloseHourOverride: true },
  });
  const effOpen = "waOpenHourOverride" in update ? update.waOpenHourOverride : current?.waOpenHourOverride ?? null;
  const effClose = "waCloseHourOverride" in update ? update.waCloseHourOverride : current?.waCloseHourOverride ?? null;
  if (effOpen != null && effClose != null && effClose <= effOpen) {
    return NextResponse.json({ error: "A hora de fechamento deve ser maior que a de abertura." }, { status: 400 });
  }

  const data = await prisma.companySettings.upsert({
    where: { companyId },
    update,
    create: { companyId, ...update },
  });

  return NextResponse.json({
    data: {
      openHourOverride: data.waOpenHourOverride,
      closeHourOverride: data.waCloseHourOverride,
      dailyCapOverride: data.waDailyCapOverride,
      skipSaturdayOverride: data.waSkipSaturdayOverride,
    },
  });
}
