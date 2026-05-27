import { getSubscriptionInfo } from "@/lib/subscription";
import { forbiddenError } from "@/lib/error-handler";

/**
 * Verifica se a empresa tem acesso a uma feature do plano.
 * Lança forbiddenError se a feature não está habilitada.
 *
 * Features são armazenadas em PlanFeature como key/value.
 * Valor "true" = feature habilitada.
 *
 * Se não houver subscription, permite (empresa pode estar em modo accessEnabled).
 */
export async function requirePlanFeature(
  companyId: string,
  feature: string
): Promise<void> {
  // Kill switch global: env var libera tudo sem deploy.
  // Aplicado coerentemente em 4 pontos do sistema (lib, layout, wrapper, /api/plan-features).
  if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") return;

  const info = await getSubscriptionInfo(companyId);

  // Sem subscription — não enforçar (pode ser accessEnabled)
  if (!info) return;

  if (info.features[feature] !== "true") {
    throw forbiddenError(
      "Funcionalidade não disponível no seu plano. Faça upgrade para ter acesso."
    );
  }
}
