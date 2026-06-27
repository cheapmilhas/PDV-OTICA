/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * Rede de segurança: garante que RankingTab continua envolto em
 * <FeatureGate feature="goals">. O gating de plano para "Metas" foi movido da
 * URL da página para esta aba; se um edit futuro remover o FeatureGate (ou
 * trocar a feature), o recurso vazaria para planos sem ele.
 *
 * Estratégia: mockamos FeatureGate para CAPTURAR a prop `feature` e NÃO renderizar
 * os children — assim GoalsPageContent nunca monta (sem fetch/hooks no jsdom).
 * Basta então afirmar que a feature capturada é "goals".
 */
let capturedFeature: string | undefined;

vi.mock("@/components/plan/feature-gate", () => ({
  FeatureGate: (props: { feature: string; children: ReactNode }) => {
    capturedFeature = props.feature;
    // NÃO renderizar children de propósito: evita montar GoalsPageContent.
    return <div data-testid="feature-gate" />;
  },
}));

import { RankingTab } from "../ranking-tab";

describe("RankingTab — rede de segurança do FeatureGate", () => {
  beforeEach(() => {
    capturedFeature = undefined;
  });

  it("envolve o conteúdo em FeatureGate feature='goals' (modo new)", () => {
    render(<RankingTab mode="new" />);
    expect(capturedFeature).toBe("goals");
  });

  it("envolve o conteúdo em FeatureGate feature='goals' (modo legacy)", () => {
    render(<RankingTab mode="legacy" />);
    expect(capturedFeature).toBe("goals");
  });
});
