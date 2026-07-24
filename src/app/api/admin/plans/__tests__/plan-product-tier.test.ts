import { describe, it, expect } from "vitest";
import {
  resolvePlanProductTier,
  isPlanTierValue,
} from "@/app/api/admin/plans/plan-product-tier";

describe("resolvePlanProductTier (fail-closed produto×tier)", () => {
  it("VIS_MEDICAL com tier válido → ok, mantém o tier", () => {
    const r = resolvePlanProductTier("VIS_MEDICAL", "clinic_full");
    expect(r).toEqual({ ok: true, tier: "clinic_full" });
  });

  it("VIS_MEDICAL sem tier → erro (senão Domus abre tudo / criação de cliente aborta)", () => {
    expect(resolvePlanProductTier("VIS_MEDICAL", undefined).ok).toBe(false);
    expect(resolvePlanProductTier("VIS_MEDICAL", null).ok).toBe(false);
    expect(resolvePlanProductTier("VIS_MEDICAL", "").ok).toBe(false);
  });

  it("VIS_MEDICAL com tier inválido → erro (não classifica no tier errado)", () => {
    expect(resolvePlanProductTier("VIS_MEDICAL", "premium").ok).toBe(false);
    expect(resolvePlanProductTier("VIS_MEDICAL", "CLINIC_FULL").ok).toBe(false); // case errado
  });

  it("VIS_APP normaliza tier para null (ótica não tem tier), mesmo se vier tier", () => {
    expect(resolvePlanProductTier("VIS_APP", undefined)).toEqual({ ok: true, tier: null });
    expect(resolvePlanProductTier("VIS_APP", "clinic_full")).toEqual({ ok: true, tier: null });
  });

  it("aceita os 3 tiers conhecidos", () => {
    for (const t of ["clinic_full", "ophthalmology", "specialist"]) {
      expect(resolvePlanProductTier("VIS_MEDICAL", t)).toEqual({ ok: true, tier: t });
    }
  });

  it("reconciliação do PATCH: medical legado com tier=null NÃO sobrevive a edição sem tier", () => {
    // Simula effectiveTier = rawTier(undefined) ?? existing.tier(null) → null → erro.
    const existingTier: string | null = null;
    const rawTier: string | undefined = undefined;
    const effectiveTier = rawTier !== undefined ? rawTier : existingTier;
    expect(resolvePlanProductTier("VIS_MEDICAL", effectiveTier).ok).toBe(false);
  });

  it("reconciliação do PATCH: medical com tier existente mantém o tier quando edição não toca tier", () => {
    const existingTier: string | null = "specialist";
    const rawTier: string | undefined = undefined;
    const effectiveTier = rawTier !== undefined ? rawTier : existingTier;
    expect(resolvePlanProductTier("VIS_MEDICAL", effectiveTier)).toEqual({ ok: true, tier: "specialist" });
  });

  it("isPlanTierValue discrimina tiers conhecidos", () => {
    expect(isPlanTierValue("specialist")).toBe(true);
    expect(isPlanTierValue("lixo")).toBe(false);
    expect(isPlanTierValue(null)).toBe(false);
    expect(isPlanTierValue(123)).toBe(false);
  });
});
