import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { rateLimitResponse } from "@/lib/rate-limit";
import { assertAiAllowed } from "@/lib/ai-guard";
import { adviseForCompany } from "@/services/lens-advisor.service";
import { handleApiError } from "@/lib/error-handler";
import { parseEye, parseFrame } from "@/lib/lens-input-parse";

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
        aiUnavailableReason: result.aiUnavailableReason ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
