import { describe, it, expect } from "vitest";
import { z } from "zod";
import { FEATURES, FEATURE_REGISTRY } from "@/lib/plan-feature-catalog";

/**
 * Trava o bug histórico da tela admin de planos (/admin/configuracoes/planos):
 * a lista AVAILABLE_FEATURES era hardcoded com 6 keys que NÃO batiam com o
 * catálogo (crm/multi_branch/reports_advanced inexistentes; faltavam 11 reais).
 * Como o salvar do plano faz deleteMany+createMany SÓ com as keys da lista,
 * salvar zerava as 15 features reais e quebrava os planos pagos.
 *
 * A correção deriva a lista do FEATURE_REGISTRY (fonte única). Estes testes
 * garantem que essa derivação cobre EXATAMENTE as 15 keys reais com labels, e
 * que o schema do backend (mesma blindagem do PATCH/POST) rejeita key inválida.
 */

// Espelha EXATAMENTE a expressão usada em planos-client.tsx (AVAILABLE_FEATURES).
const adminAvailableFeatures = Object.values(FEATURES).map((key) => ({
  key,
  label: FEATURE_REGISTRY[key].label,
}));

describe("Admin planos — AVAILABLE_FEATURES derivado do catálogo", () => {
  it("cobre exatamente as 15 keys reais do catálogo (nem a mais, nem a menos)", () => {
    const adminKeys = adminAvailableFeatures.map((f) => f.key).sort();
    const catalogKeys = Object.values(FEATURES).sort();
    expect(adminKeys).toEqual(catalogKeys);
    expect(adminKeys).toHaveLength(15);
  });

  it("NÃO contém mais as keys fantasma do bug antigo", () => {
    const adminKeys = adminAvailableFeatures.map((f) => f.key);
    expect(adminKeys).not.toContain("crm");
    expect(adminKeys).not.toContain("multi_branch");
    expect(adminKeys).not.toContain("reports_advanced");
  });

  it("inclui 'goals' (Metas & Comissões) com label não-vazio", () => {
    const goals = adminAvailableFeatures.find((f) => f.key === FEATURES.GOALS);
    expect(goals).toBeDefined();
    expect(goals?.label).toBeTruthy();
  });

  it("todo item tem label não-vazio", () => {
    for (const f of adminAvailableFeatures) {
      expect(f.label, `label vazio para ${f.key}`).toBeTruthy();
    }
  });
});

// Espelha o schema de features do PATCH/POST de /api/admin/plans (blindagem zod).
const FEATURE_KEYS = Object.values(FEATURES) as [string, ...string[]];
const featuresSchema = z.array(
  z.object({
    key: z.enum(FEATURE_KEYS),
    value: z.enum(["true", "false"]),
  }),
);

describe("Admin planos — schema do backend rejeita key inválida", () => {
  it("aceita uma feature válida do catálogo", () => {
    const r = featuresSchema.safeParse([{ key: FEATURES.GOALS, value: "true" }]);
    expect(r.success).toBe(true);
  });

  it("rejeita key fora do catálogo (ex.: a fantasma 'crm')", () => {
    const r = featuresSchema.safeParse([{ key: "crm", value: "true" }]);
    expect(r.success).toBe(false);
  });

  it("rejeita value que não seja 'true'/'false'", () => {
    const r = featuresSchema.safeParse([{ key: FEATURES.GOALS, value: "sim" }]);
    expect(r.success).toBe(false);
  });

  it("aceita o conjunto completo das 15 keys reais", () => {
    const all = Object.values(FEATURES).map((key) => ({ key, value: "true" as const }));
    const r = featuresSchema.safeParse(all);
    expect(r.success).toBe(true);
  });
});
