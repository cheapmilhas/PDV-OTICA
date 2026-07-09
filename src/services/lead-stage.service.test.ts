import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_LEAD_STAGES, ensureDefaultStages } from "./lead-stage.service";

vi.mock("@/lib/prisma", () => ({
  prisma: { leadStage: { count: vi.fn(), createMany: vi.fn() } },
}));
import { prisma } from "@/lib/prisma";

describe("DEFAULT_LEAD_STAGES", () => {
  it("tem 8 etapas com exatamente 1 isWon e 1 isLost", () => {
    expect(DEFAULT_LEAD_STAGES).toHaveLength(8);
    expect(DEFAULT_LEAD_STAGES.filter((s) => s.isWon)).toHaveLength(1);
    expect(DEFAULT_LEAD_STAGES.filter((s) => s.isLost)).toHaveLength(1);
  });
});

describe("ensureDefaultStages (idempotente/aditivo)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não cria nada se a empresa já tem etapas", async () => {
    (prisma.leadStage.count as any).mockResolvedValue(5);
    const created = await ensureDefaultStages("co_1");
    expect(created).toBe(0);
    expect(prisma.leadStage.createMany).not.toHaveBeenCalled();
  });

  it("cria as etapas padrão se a empresa não tem nenhuma", async () => {
    (prisma.leadStage.count as any).mockResolvedValue(0);
    (prisma.leadStage.createMany as any).mockResolvedValue({ count: 5 });
    const created = await ensureDefaultStages("co_1");
    expect(created).toBe(5);
    expect(prisma.leadStage.createMany).toHaveBeenCalledWith({
      data: DEFAULT_LEAD_STAGES.map((s) => ({ ...s, companyId: "co_1" })),
    });
  });
});
