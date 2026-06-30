import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { lead: { findMany: vi.fn() } },
}));
import { prisma } from "@/lib/prisma";
import { getRecentIntentCorrections, buildFewShotBlock } from "./funnel-fewshot.service";

beforeEach(() => vi.clearAllMocks());

describe("getRecentIntentCorrections — colinha das correções da ótica", () => {
  it("filtra por companyId, só corrigidos (intentCorrectedAt != null), recentes primeiro", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { intentPredicted: "NOVA_COMPRA", intent: "RECLAMACAO" },
      { intentPredicted: "ORCAMENTO_PRECO", intent: "GARANTIA_CONSERTO" },
    ]);
    const r = await getRecentIntentCorrections("co_1", 5);

    const where = (prisma.lead.findMany as any).mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: "co_1" });
    expect(where.intentCorrectedAt).toMatchObject({ not: null });
    expect((prisma.lead.findMany as any).mock.calls[0][0].orderBy).toMatchObject({ intentCorrectedAt: "desc" });
    expect((prisma.lead.findMany as any).mock.calls[0][0].take).toBe(5);
    expect(r).toHaveLength(2);
  });

  it("ignora correções onde predito == corrigido (não é divergência real)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { intentPredicted: "NOVA_COMPRA", intent: "NOVA_COMPRA" }, // igual → descarta
      { intentPredicted: "NOVA_COMPRA", intent: "RECLAMACAO" },
    ]);
    const r = await getRecentIntentCorrections("co_1", 5);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ predicted: "NOVA_COMPRA", correct: "RECLAMACAO" });
  });

  it("descarta linhas com intent/predicted nulos", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { intentPredicted: null, intent: "RECLAMACAO" },
      { intentPredicted: "NOVA_COMPRA", intent: null },
    ]);
    const r = await getRecentIntentCorrections("co_1", 5);
    expect(r).toHaveLength(0);
  });
});

describe("buildFewShotBlock — vira texto p/ o prompt (SEM PII, só enums)", () => {
  it("monta bloco com as correções", () => {
    const block = buildFewShotBlock([
      { predicted: "NOVA_COMPRA", correct: "RECLAMACAO" },
      { predicted: "ORCAMENTO_PRECO", correct: "GARANTIA_CONSERTO" },
    ]);
    expect(block).toContain("NOVA_COMPRA");
    expect(block).toContain("RECLAMACAO");
    // o bloco não deve conter NADA além de rótulos de intenção (sem texto livre/PII)
    expect(block.toLowerCase()).not.toContain("cliente ");
  });

  it("lista vazia → string vazia (não injeta nada)", () => {
    expect(buildFewShotBlock([])).toBe("");
  });
});
