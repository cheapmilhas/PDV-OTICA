"use client";

import { Lock } from "lucide-react";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { FEATURE_REGISTRY, type FeatureKey } from "@/lib/plan-feature-catalog";

interface FeatureGateProps {
  /**
   * Feature key. Aceita FeatureKey do catálogo (preferido) ou string legacy
   * (ex: "goals", "crm") para retrocompatibilidade com chamadas existentes.
   */
  feature: FeatureKey | string;
  /** Override do label. Quando ausente, lê de FEATURE_REGISTRY[feature].label. */
  featureName?: string;
  /** Renderiza algo customizado (ou null) quando bloqueado. Sobrepõe o card padrão. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

function resolveLabel(feature: string, override?: string): string {
  if (override) return override;
  const registryEntry = (FEATURE_REGISTRY as Record<string, { label: string }>)[feature];
  return registryEntry?.label ?? feature;
}

export function FeatureGate({ feature, featureName, fallback, children }: FeatureGateProps) {
  const { loading, hasFeature } = usePlanFeatures();

  // Durante o carregamento, renderiza normalmente para evitar flash
  if (loading) {
    return <>{children}</>;
  }

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  const label = resolveLabel(feature, featureName);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
            <Lock className="h-7 w-7 text-yellow-500" />
          </div>
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">
          Recurso não disponível no seu plano
        </h2>
        <p className="mb-6 text-sm text-gray-400">
          O recurso <span className="font-semibold text-gray-300">{label}</span> está disponível
          no plano Profissional ou superior.
        </p>
        <a
          href="https://wa.me/558599252772"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
        >
          Falar com suporte
        </a>
      </div>
    </div>
  );
}
