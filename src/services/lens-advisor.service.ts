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

/**
 * Motivo (seguro, sem vazar a chave/segredo) pelo qual a IA não respondeu.
 * Usado pela UI para mostrar uma mensagem acionável em vez de uma genérica.
 *  - no_key:      nenhuma chave Anthropic configurada
 *  - no_credit:   conta Anthropic sem saldo (API 400 "credit balance too low")
 *  - invalid_key: chave inválida/revogada (API 401/403)
 *  - generic:     qualquer outra falha (rede, timeout, config)
 */
export type AiUnavailableReason = "no_key" | "no_credit" | "invalid_key" | "generic";

export interface AdviseResult {
  analysis: LensAnalysis;
  advice: string | null;
  aiUnavailable?: boolean;
  aiUnavailableReason?: AiUnavailableReason;
}

/**
 * Classifica o erro da IA num motivo SEGURO (nunca expõe a mensagem crua, que
 * poderia conter trechos de chave/segredo). Baseia-se no status HTTP do SDK da
 * Anthropic e em pistas textuais conservadoras.
 */
export function classifyAiError(error: unknown): AiUnavailableReason {
  const message = error instanceof Error ? error.message : String(error);
  // Sem chave: lançado explicitamente por explainLensRecommendation.
  if (/api key não configurada|api key not configured/i.test(message)) return "no_key";
  // Status do SDK da Anthropic (APIError tem .status).
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 400 && /credit|balance|quota|insufficient/i.test(message)) return "no_credit";
  if (/credit balance|insufficient.*credit/i.test(message)) return "no_credit";
  return "generic";
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
    const message = error instanceof Error ? error.message : String(error);
    const reason = classifyAiError(error);
    logger
      .child({ service: "lens-advisor" })
      .error("IA indisponível — caindo para só o motor", { error: message, reason, companyId: input.companyId });
    return { analysis, advice: null, aiUnavailable: true, aiUnavailableReason: reason };
  }
}
