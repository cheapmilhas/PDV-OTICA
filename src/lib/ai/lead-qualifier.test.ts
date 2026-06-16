import { describe, it, expect, vi, beforeEach } from "vitest";
const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: (...a: unknown[]) => createMock(...a) }; } }));
import { qualifyConversationText } from "./lead-qualifier";

beforeEach(() => vi.clearAllMocks());
function mockJson(obj: unknown, usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0 }) {
  createMock.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(obj) }], usage });
}

describe("qualifyConversationText", () => {
  it("isLead=true → interesse + stageId mapeado + usage; usa claude-sonnet-4-6 e system prompt", async () => {
    mockJson({ isLead: true, reason: "quer óculos de grau", interest: "grau", suggestedStageName: "Novo", confidence: 0.9 });
    const r = await qualifyConversationText("quanto custa um óculos de grau?", [{ id: "s_novo", name: "Novo" }, { id: "s2", name: "Em atendimento" }]);
    expect(r.isLead).toBe(true);
    expect(r.interest).toBe("grau");
    expect(r.stageId).toBe("s_novo");
    expect(r.usage.inputTokens).toBe(100);
    const arg = createMock.mock.calls[0][0];
    expect(arg.model).toBe("claude-sonnet-4-6");
    expect(typeof arg.system).toBe("string");
    expect(arg.messages[0].role).toBe("user");
  });
  it("isLead=false → stageId null", async () => {
    mockJson({ isLead: false, reason: "horário", confidence: 0.8 });
    const r = await qualifyConversationText("que horas abrem?", [{ id: "s_novo", name: "Novo" }]);
    expect(r.isLead).toBe(false);
    expect(r.stageId).toBeNull();
  });
  it("stage sugerida inexistente → primeira etapa", async () => {
    mockJson({ isLead: true, reason: "lead", suggestedStageName: "Inexistente", confidence: 0.7 });
    const r = await qualifyConversationText("quero lente de contato", [{ id: "s_novo", name: "Novo" }, { id: "s2", name: "X" }]);
    expect(r.stageId).toBe("s_novo");
  });
  it("JSON inválido → isLead=false defensivo (parseError, não lança)", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "não é json" }], usage: { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0 } });
    const r = await qualifyConversationText("oi", [{ id: "s_novo", name: "Novo" }]);
    expect(r.isLead).toBe(false);
    expect(r.parseError).toBe(true);
  });
});
