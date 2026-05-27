"use client";

import { Lock, X } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FEATURE_REGISTRY, type FeatureKey } from "@/lib/plan-feature-catalog";

/**
 * Banner exibido em /dashboard quando o gate redireciona com
 * ?upgrade-required=<feature>. Lê a feature do query param, mostra label do
 * FEATURE_REGISTRY e oferece link de contato. Auto-some ao trocar de rota.
 */
export function UpgradeRequiredBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const featureParam = params?.get("upgrade-required");
  const [visible, setVisible] = useState<boolean>(Boolean(featureParam));

  // Garante que se voltar a uma URL com o param o banner reaparece.
  useEffect(() => {
    setVisible(Boolean(featureParam));
  }, [featureParam]);

  if (!visible || !featureParam) return null;

  const label =
    (FEATURE_REGISTRY as Record<string, { label: string }>)[featureParam]?.label ??
    featureParam;

  const dismiss = () => {
    setVisible(false);
    // Limpa o param da URL sem reload.
    const newParams = new URLSearchParams(params?.toString() ?? "");
    newParams.delete("upgrade-required");
    const next = newParams.toString();
    router.replace(`${pathname}${next ? `?${next}` : ""}`);
  };

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1 text-sm">
        <strong>{label}</strong> não está disponível no seu plano.{" "}
        <a
          href="https://wa.me/558599252772"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline"
        >
          Fazer upgrade
        </a>
      </div>
      <button
        type="button"
        aria-label="Fechar"
        onClick={dismiss}
        className="flex-shrink-0 rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
