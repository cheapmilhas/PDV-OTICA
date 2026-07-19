import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do prisma ANTES de importar o módulo sob teste.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: { findMany: vi.fn() },
  },
}));

import { resolvePlanForTier } from "../resolve-plan-for-tier";
import { prisma } from "@/lib/prisma";

const planFindMany = prisma.plan.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolvePlanForTier — fail-closed", () => {
  it("resolve EXATAMENTE 1 plano elegível → retorna o plano", async () => {
    planFindMany.mockResolvedValue([
      { id: "plan_clinica", slug: "medical-clinica", tier: "clinic_full" },
    ]);
    const plan = await resolvePlanForTier("clinic_full");
    expect(plan.id).toBe("plan_clinica");
    // consulta filtra por platformProduct=VIS_MEDICAL + tier + selfServiceSelectable + isActive
    const where = planFindMany.mock.calls[0][0].where;
    expect(where.platformProduct).toBe("VIS_MEDICAL");
    expect(where.tier).toBe("clinic_full");
    expect(where.selfServiceSelectable).toBe(true);
    expect(where.isActive).toBe(true);
  });

  it("ZERO planos elegíveis → lança (fail-closed, não escolhe nada)", async () => {
    planFindMany.mockResolvedValue([]);
    await expect(resolvePlanForTier("ophthalmology")).rejects.toThrow();
  });

  it("MAIS DE UM plano elegível → lança (ambiguidade = fail-closed)", async () => {
    planFindMany.mockResolvedValue([
      { id: "plan_a", slug: "a", tier: "specialist" },
      { id: "plan_b", slug: "b", tier: "specialist" },
    ]);
    await expect(resolvePlanForTier("specialist")).rejects.toThrow();
  });

  it("tier inválido → lança antes de consultar o banco", async () => {
    // @ts-expect-error tier inválido de propósito
    await expect(resolvePlanForTier("enterprise_plus")).rejects.toThrow();
    expect(planFindMany).not.toHaveBeenCalled();
  });
});
