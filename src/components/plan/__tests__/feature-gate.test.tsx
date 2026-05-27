/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/usePlanFeatures", () => ({
  usePlanFeatures: vi.fn(),
}));

import { FeatureGate } from "@/components/plan/feature-gate";
import { FEATURES } from "@/lib/plan-feature-catalog";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";

describe("FeatureGate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renderiza children durante loading (evita flash)", () => {
    (usePlanFeatures as any).mockReturnValue({ loading: true, hasFeature: () => false });
    render(
      <FeatureGate feature={FEATURES.LENS_TREATMENTS}>
        <div>Conteúdo</div>
      </FeatureGate>,
    );
    expect(screen.getByText("Conteúdo")).toBeDefined();
  });

  it("renderiza children quando hasFeature retorna true", () => {
    (usePlanFeatures as any).mockReturnValue({ loading: false, hasFeature: () => true });
    render(
      <FeatureGate feature={FEATURES.LENS_TREATMENTS}>
        <div>Liberado</div>
      </FeatureGate>,
    );
    expect(screen.getByText("Liberado")).toBeDefined();
  });

  it("infere label do FEATURE_REGISTRY quando bloqueado e sem featureName", () => {
    (usePlanFeatures as any).mockReturnValue({ loading: false, hasFeature: () => false });
    render(
      <FeatureGate feature={FEATURES.LENS_TREATMENTS}>
        <div>Children</div>
      </FeatureGate>,
    );
    // Label "Tratamentos de Lente" vem do FEATURE_REGISTRY
    expect(screen.getByText(/Tratamentos de Lente/)).toBeDefined();
    // Children NÃO devem aparecer quando bloqueado
    expect(screen.queryByText("Children")).toBeNull();
  });

  it("featureName explícito sobrepõe o registry", () => {
    (usePlanFeatures as any).mockReturnValue({ loading: false, hasFeature: () => false });
    render(
      <FeatureGate feature={FEATURES.LENS_TREATMENTS} featureName="Custom Override">
        <div>Children</div>
      </FeatureGate>,
    );
    expect(screen.getByText(/Custom Override/)).toBeDefined();
  });

  it("retrocompatível: aceita string legacy (não do catálogo)", () => {
    (usePlanFeatures as any).mockReturnValue({ loading: false, hasFeature: () => false });
    render(
      <FeatureGate feature="goals" featureName="Metas">
        <div>Children</div>
      </FeatureGate>,
    );
    expect(screen.getByText(/Metas/)).toBeDefined();
  });

  it("fallback substitui o card padrão quando provido", () => {
    (usePlanFeatures as any).mockReturnValue({ loading: false, hasFeature: () => false });
    render(
      <FeatureGate feature={FEATURES.STOCK_TRANSFERS} fallback={<span>FB</span>}>
        <div>Children</div>
      </FeatureGate>,
    );
    expect(screen.getByText("FB")).toBeDefined();
    expect(screen.queryByText(/Recurso não disponível/)).toBeNull();
  });

  it("fallback={null} esconde tudo (útil em botões inline)", () => {
    (usePlanFeatures as any).mockReturnValue({ loading: false, hasFeature: () => false });
    const { container } = render(
      <FeatureGate feature={FEATURES.SALES_REFUNDS} fallback={null}>
        <button>Devolver</button>
      </FeatureGate>,
    );
    // Nenhum botão e nenhum card
    expect(container.querySelector("button")).toBeNull();
    expect(screen.queryByText(/Recurso não disponível/)).toBeNull();
  });
});
