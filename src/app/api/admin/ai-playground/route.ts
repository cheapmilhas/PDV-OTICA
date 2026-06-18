import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { analyzeLens } from "@/lib/lens-optics";
import { parseEye, parseFrame } from "@/lib/lens-input-parse";
import { buildKnowledgeContext, buildGlobalContext } from "@/services/lens-knowledge.service";
import { explainLensRecommendation } from "@/lib/ai/lens-advisor";
import { getAiConfig } from "@/services/ai-config.service";
import { logAiUsage } from "@/services/ai-usage.service";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido (JSON esperado)" }, { status: 400 });
  }
  const b = body != null && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const od = parseEye(b.od);
  const oe = parseEye(b.oe);
  const frame = parseFrame(b.frame);

  const analysis = analyzeLens({ od, oe }, frame);

  const companyId = typeof b.companyId === "string" && b.companyId ? b.companyId : null;
  const ctx = companyId ? await buildKnowledgeContext(companyId) : await buildGlobalContext();

  // Resumo do contexto — NUNCA devolve o conteúdo cru dos documentos.
  const scopes = ctx.docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.scope] = (acc[d.scope] ?? 0) + 1;
    return acc;
  }, {});
  const context = { docCount: ctx.docs.length, tokens: ctx.tokens, scopes };

  // Fase 3: chama Claude para explicar o motor. Loga com companyId NULL (playground
  // isolado — nunca toca a cota da ótica-alvo). Degrada: erro/sem chave → advice null.
  // Variante "playground" de adviseForCompany (lens-advisor.service.ts): mesma chamada de
  // IA, mas companyId=null + feature própria + usa buildGlobalContext quando não há ótica.
  // Mantida separada de propósito — não fundir no service (que sempre cobra a ótica).
  let advice: string | null = null;
  // Diagnóstico (SÓ super admin vê): motivo da falha da IA, SEM nunca expor a chave.
  // Sanitizado para não vazar segredo: só o nome/mensagem do erro (ex.: authTag, 401 da API).
  let aiError: string | null = null;
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
  } catch (error) {
    // Sem chave / erro de API → degrada para só motor+contexto, sem custo logado.
    // Loga o motivo para problemas de config de IA ficarem visíveis no servidor.
    const rawMessage = error instanceof Error ? error.message : String(error);
    // Redação defensiva: remove qualquer ocorrência de "sk-..." caso a mensagem do
    // SDK ecoe parte da chave. Nunca devolve o segredo.
    aiError = rawMessage.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
    logger
      .child({ route: "ai-playground" })
      .warn("Claude indisponível no playground — degradando para só o motor", {
        error: rawMessage,
        name: error instanceof Error ? error.name : undefined,
      });
    advice = null;
  }

  return NextResponse.json({ data: { analysis, context, advice, aiError } });
}
