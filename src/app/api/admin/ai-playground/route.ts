import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { analyzeLens } from "@/lib/lens-optics";
import { buildKnowledgeContext, buildGlobalContext } from "@/services/lens-knowledge.service";
import { explainLensRecommendation } from "@/lib/ai/lens-advisor";
import { getAiConfig } from "@/services/ai-config.service";
import { logAiUsage } from "@/services/ai-usage.service";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  const body = await request.json();
  const od = body.od ?? { sph: 0, cyl: 0 };
  const oe = body.oe ?? { sph: 0, cyl: 0 };
  const frame =
    body.frame && typeof body.frame.lensWidthMm === "number" && typeof body.frame.bridgeMm === "number"
      ? body.frame
      : undefined;

  const analysis = analyzeLens({ od, oe }, frame);

  const companyId = typeof body.companyId === "string" && body.companyId ? body.companyId : null;
  const ctx = companyId ? await buildKnowledgeContext(companyId) : await buildGlobalContext();

  // Resumo do contexto — NUNCA devolve o conteúdo cru dos documentos.
  const scopes = ctx.docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.scope] = (acc[d.scope] ?? 0) + 1;
    return acc;
  }, {});
  const context = { docCount: ctx.docs.length, tokens: ctx.tokens, scopes };

  // Fase 3: chama Claude para explicar o motor. Loga com companyId NULL (playground
  // isolado — nunca toca a cota da ótica-alvo). Degrada: erro/sem chave → advice null.
  let advice: string | null = null;
  try {
    const cfg = await getAiConfig();
    const { text, usage } = await explainLensRecommendation({ motor: analysis, docs: ctx.docs }, cfg.lensAdvisorModel);
    advice = text;
    await logAiUsage({
      companyId: null,
      feature: "lens_advisor_playground",
      provider: "anthropic",
      model: cfg.lensAdvisorModel,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheTokens: usage.cacheTokens,
    });
  } catch {
    // sem chave / erro de API → só motor+contexto; não loga (sem custo)
    advice = null;
  }

  return NextResponse.json({ data: { analysis, context, advice } });
}
