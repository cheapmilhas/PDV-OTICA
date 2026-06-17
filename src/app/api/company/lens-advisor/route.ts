import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { rateLimitResponse } from "@/lib/rate-limit";
import { assertAiAllowed } from "@/lib/ai-guard";
import { adviseForCompany } from "@/services/lens-advisor.service";
import { handleApiError } from "@/lib/error-handler";
import type { EyePower, FrameSize } from "@/lib/lens-optics";

/** Coage um campo numérico do corpo (não confiar no body). NaN/ausente/não-número → fallback. */
function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Olho do corpo → EyePower; sph/cyl obrigatórios (default 0); axis/add só se numéricos. */
function parseEye(raw: unknown): EyePower {
  const r = (raw ?? {}) as Record<string, unknown>;
  const axis = num(r.axis, NaN);
  const add = num(r.add, NaN);
  return {
    sph: num(r.sph, 0),
    cyl: num(r.cyl, 0),
    ...(Number.isFinite(axis) ? { axis } : {}),
    ...(Number.isFinite(add) ? { add } : {}),
  };
}

/** Armação do corpo → FrameSize, só quando AMBAS as medidas são números; senão undefined. */
function parseFrame(raw: unknown): FrameSize | undefined {
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as Record<string, unknown>).lensWidthMm === "number" &&
    typeof (raw as Record<string, unknown>).bridgeMm === "number"
  ) {
    const r = raw as { lensWidthMm: number; bridgeMm: number };
    return { lensWidthMm: r.lensWidthMm, bridgeMm: r.bridgeMm };
  }
  return undefined;
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("company.settings");

    const limited = rateLimitResponse(`lens-advisor:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60_000,
    });
    if (limited) return limited;

    await assertAiAllowed(companyId);

    const body = await request.json();
    const od = parseEye(body?.od);
    const oe = parseEye(body?.oe);
    const frame = parseFrame(body?.frame);

    const result = await adviseForCompany({ companyId, od, oe, frame });

    // Devolve SOMENTE motor + explicação — NUNCA custo/markup/tokens.
    return NextResponse.json({
      data: {
        analysis: result.analysis,
        advice: result.advice,
        aiUnavailable: result.aiUnavailable ?? false,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
