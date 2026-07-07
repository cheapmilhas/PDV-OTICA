import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { globalAudit: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { getAiConfigHistory } from "./ai-config-history.service";

const findMany = prisma.globalAudit.findMany as unknown as ReturnType<typeof vi.fn>;

const row = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  createdAt: new Date("2026-07-07T12:00:00Z"),
  adminUser: { name: "Matheus" },
  metadata: { changedFields: ["usdBrlRate"], usdBrlRate: 5.8 },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("getAiConfigHistory", () => {
  it("consulta só AI_CONFIG_CHANGED, mais recentes primeiro", async () => {
    findMany.mockResolvedValue([row()]);
    await getAiConfigHistory(30);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ action: "AI_CONFIG_CHANGED" });
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.take).toBe(30);
  });

  it("traduz campo para rótulo humano + valor", async () => {
    findMany.mockResolvedValue([row({ metadata: { changedFields: ["usdBrlRate", "qualifierModel"], usdBrlRate: 5.8, qualifierModel: "claude-opus-4-8" } })]);
    const [e] = await getAiConfigHistory();
    expect(e.changes).toEqual([
      { label: "Câmbio USD→BRL", value: "5.8" },
      { label: "Modelo de qualificação", value: "claude-opus-4-8" },
    ]);
  });

  it("chave de API aparece como 'alterada' (NUNCA o valor)", async () => {
    findMany.mockResolvedValue([row({ metadata: { changedFields: ["anthropicKey"], anthropicKeyChanged: true } })]);
    const [e] = await getAiConfigHistory();
    expect(e.changes).toEqual([{ label: "Chave Anthropic", value: "alterada" }]);
    // nunca vaza o valor da chave
    expect(JSON.stringify(e)).not.toMatch(/sk-/);
  });

  it("chave listada em changedFields mas não tocada (flag false) some", async () => {
    findMany.mockResolvedValue([row({ metadata: { changedFields: ["anthropicKey"], anthropicKeyChanged: false } })]);
    const [e] = await getAiConfigHistory();
    expect(e.changes).toEqual([]);
  });

  it("actorName cai em 'Sistema' quando não há admin", async () => {
    findMany.mockResolvedValue([row({ adminUser: null })]);
    const [e] = await getAiConfigHistory();
    expect(e.actorName).toBe("Sistema");
  });

  it("metadata inesperado não quebra (linha sem mudanças legíveis)", async () => {
    findMany.mockResolvedValue([row({ metadata: null }), row({ metadata: { changedFields: "não-array" } })]);
    const entries = await getAiConfigHistory();
    expect(entries[0].changes).toEqual([]);
    expect(entries[1].changes).toEqual([]);
  });

  it("createdAt vira ISO string", async () => {
    findMany.mockResolvedValue([row()]);
    const [e] = await getAiConfigHistory();
    expect(e.createdAt).toBe("2026-07-07T12:00:00.000Z");
  });
});
