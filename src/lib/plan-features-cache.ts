/**
 * Cache em memória das features ativas por empresa.
 *
 * LRU com cap em 500 empresas (suficiente para o estado atual da base) e TTL de 5min.
 * Erros de DB NÃO são cacheados — próxima request tenta de novo. Fail-open é
 * responsabilidade do caller (layout/wrapper devem try/catch e seguir sem bloquear).
 *
 * Invalidação: chamar `invalidatePlanFeaturesCache(companyId)` ao trocar plano.
 *
 * Atenção em serverless: cada lambda tem seu próprio cache. Aceita-se convergência
 * em até 5min (TTL). Sem Redis no escopo atual.
 */
import { LRUCache } from "lru-cache";
import { getSubscriptionInfo } from "@/lib/subscription";
import { metrics } from "./observability/metrics";

export interface CachedPlanFeatures {
  features: Record<string, boolean>;
  /**
   * `false` indica modo "sem subscription explícita" — Company tem
   * accessEnabled=true ou trial. NESSE caso o guard libera (compatível com
   * comportamento atual de requirePlanFeature).
   */
  hasSubscription: boolean;
}

const cache = new LRUCache<string, CachedPlanFeatures>({
  max: 500,
  ttl: 5 * 60 * 1000,
});

export async function getCachedPlanFeatures(
  companyId: string,
): Promise<CachedPlanFeatures> {
  const hit = cache.get(companyId);
  if (hit) {
    metrics.cacheHit();
    return hit;
  }
  metrics.cacheMiss();

  // Se DB falhar, propaga erro sem cachear — caller decide fail-open.
  const info = await getSubscriptionInfo(companyId);

  const value: CachedPlanFeatures = info?.features
    ? {
        features: Object.fromEntries(
          Object.entries(info.features).map(([k, v]) => [k, v === "true"]),
        ),
        hasSubscription: true,
      }
    : { features: {}, hasSubscription: false };

  cache.set(companyId, value);
  return value;
}

export function invalidatePlanFeaturesCache(companyId: string): void {
  cache.delete(companyId);
}

/** Útil em testes — limpa todas as entradas. NÃO chamar em produção. */
export function _clearPlanFeaturesCacheForTests(): void {
  cache.clear();
}
