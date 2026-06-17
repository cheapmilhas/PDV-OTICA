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
  // Guarda contra primitivos (ex.: od=42 ou "x"): só objetos viram Record; o
  // resto coage a {} → defaults sph:0/cyl:0 (em vez de um cast inseguro).
  const r = raw != null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const axis = num(r.axis, NaN);
  const add = num(r.add, NaN);
  return {
    sph: num(r.sph, 0),
    cyl: num(r.cyl, 0),
    ...(Number.isFinite(axis) ? { axis } : {}),
    ...(Number.isFinite(add) ? { add } : {}),
  };
}

/** Armação do corpo → FrameSize, só quando AMBAS as medidas são números FINITOS; senão undefined. */
function parseFrame(raw: unknown): FrameSize | undefined {
  // Number.isFinite (não typeof === "number"): NaN e Infinity são typeof
  // "number" e passariam num guard por typeof — aqui são rejeitados.
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Number.isFinite(r.lensWidthMm) && Number.isFinite(r.bridgeMm)) {
      return { lensWidthMm: r.lensWidthMm as number, bridgeMm: r.bridgeMm as number };
    }
  }
  return undefined;
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("company.settings");

    // Chave por usuário: um usuário com acesso a várias óticas compartilha um
    // único balde entre tenants — aceitável, pois a rota já é escopada por
    // ótica via requirePermission("company.settings") + getCompanyId().
    const limited = rateLimitResponse(`lens-advisor:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60_000,
    });
    if (limited) return limited;

    await assertAiAllowed(companyId);

    // body é não-confiável: parse DENTRO do try (corpo não-JSON → handleApiError,
    // não 500 fora do catch) e leitura via acesso estreitado (nunca cast direto).
    const body: unknown = await request.json();
    const b = body != null && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const od = parseEye(b.od);
    const oe = parseEye(b.oe);
    const frame = parseFrame(b.frame);

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
