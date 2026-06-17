import { analyzeLens, type EyePower, type FrameSize, type LensAnalysis } from "@/lib/lens-optics";
import { buildKnowledgeContext } from "@/services/lens-knowledge.service";
import { explainLensRecommendation } from "@/lib/ai/lens-advisor";
import { logAiUsage } from "@/services/ai-usage.service";
import { getAiConfig } from "@/services/ai-config.service";
import { logger } from "@/lib/logger";

export interface AdviseInput {
  companyId: string;
  od: EyePower;
  oe: EyePower;
  frame?: FrameSize;
}

export interface AdviseResult {
  analysis: LensAnalysis;
  advice: string | null;
  aiUnavailable?: boolean;
}

/**
 * Orquestra o motor óptico determinístico + a explicação por IA.
 *
 * O motor (puro, custo zero) SEMPRE roda primeiro e o resultado SEMPRE volta.
 * A IA é um enriquecimento opcional dentro de um try/catch: qualquer falha
 * (sem key, erro de API, erro de config/contexto) cai graciosamente para "só o
 * motor" (advice null, aiUnavailable true) e NÃO registra custo.
 *
 * NÃO chama assertAiAllowed — o gate é responsabilidade da ROTA. Este serviço
 * assume o gate já passou e é um fail-safe puro.
 */
export async function adviseForCompany(input: AdviseInput): Promise<AdviseResult> {
  const analysis = analyzeLens({ od: input.od, oe: input.oe }, input.frame);
  try {
    const cfg = await getAiConfig();
    const ctx = await buildKnowledgeContext(input.companyId);
    const { text, usage } = await explainLensRecommendation(
      { motor: analysis, docs: ctx.docs },
      cfg.lensAdvisorModel,
    );
    // A chamada à IA resolveu = chamada faturável real (mesmo com text null,
    // quando o modelo não emite bloco de texto). Loga o uso sempre.
    await logAiUsage({
      companyId: input.companyId,
      feature: "lens_advisor",
      provider: "anthropic",
      model: cfg.lensAdvisorModel,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheTokens: usage.cacheTokens,
    });
    return { analysis, advice: text };
  } catch (error) {
    // Degradação graciosa: o motor sempre volta; falha na IA (sem key / erro de
    // API / erro de config) → só o motor, sem custo registrado.
    logger
      .child({ service: "lens-advisor" })
      .warn("IA indisponível — caindo para só o motor", { error, companyId: input.companyId });
    return { analysis, advice: null, aiUnavailable: true };
  }
}
