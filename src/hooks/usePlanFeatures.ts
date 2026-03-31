"use client";

import { useState, useEffect } from "react";

interface PlanFeaturesData {
  features: Record<string, string>;
  limits: {
    maxUsers: number;
    maxBranches: number;
    maxProducts: number;
    maxStorageMB: number;
  };
}

interface UsePlanFeaturesResult {
  features: Record<string, string>;
  loading: boolean;
  hasFeature: (key: string) => boolean;
}

export function usePlanFeatures(): UsePlanFeaturesResult {
  const [features, setFeatures] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchFeatures() {
      try {
        const res = await fetch("/api/plan-features");
        if (!res.ok) return;
        const data: PlanFeaturesData = await res.json();
        if (!cancelled) {
          setFeatures(data.features ?? {});
        }
      } catch {
        // Silently fail — feature gates will default to open during loading
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchFeatures();

    return () => {
      cancelled = true;
    };
  }, []);

  function hasFeature(key: string): boolean {
    return features[key] === "true";
  }

  return { features, loading, hasFeature };
}
