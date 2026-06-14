import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    leadStage: { findFirst: vi.fn() },
    lead: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";
import { createLead } from "./lead.service";

beforeEach(() => vi.clearAllMocks());

describe("createLead", () => {
  it("cria lead só com nome, usando a 1ª etapa quando stageId não é dado", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.lead.findFirst as any).mockResolvedValue(null); // sem duplicado
    (prisma.lead.create as any).mockResolvedValue({ id: "lead_1", name: "Maria", stageId: "stg_novo" });

    const r = await createLead({ name: "Maria" }, "co_1", "user_1", "br_1");
    expect(r.lead.stageId).toBe("stg_novo");
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  it("lança se a empresa não tem nenhuma etapa", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue(null);
    await expect(createLead({ name: "X" }, "co_1", "u", "b")).rejects.toThrow();
  });

  it("retorna duplicateWarning quando há lead ativo com mesmo telefone", async () => {
    (prisma.leadStage.findFirst as any).mockResolvedValue({ id: "stg_novo" });
    (prisma.lead.findFirst as any).mockResolvedValue({ id: "lead_old" }); // duplicado
    (prisma.lead.create as any).mockResolvedValue({ id: "lead_2", name: "Maria" });

    const r = await createLead({ name: "Maria", phone: "85999" }, "co_1", "u", "b");
    expect(r.duplicateWarning).toBe(true);
  });
});
