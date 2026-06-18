import { describe, it, expect, vi, beforeEach } from "vitest";
const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor(_opts?: unknown) {} messages = { create: (...a: unknown[]) => createMock(...a) }; } }));
vi.mock("@/services/ai-config.service", () => ({ getAnthropicKey: vi.fn() }));
import { getAnthropicKey } from "@/services/ai-config.service";
import { explainLensRecommendation, LENS_ADVISOR_MODEL, type LensAdvisorInput } from "./lens-advisor";
import type { LensAnalysis } from "@/lib/lens-optics";

beforeEach(() => {
  vi.clearAllMocks();
  (getAnthropicKey as ReturnType<typeof vi.fn>).mockResolvedValue("test-key");
});

function mockText(text: string, usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0 }) {
  createMock.mockResolvedValue({ content: [{ type: "text", text }], usage });
}

const motor: LensAnalysis = {
  valid: true,
  od: { index: ["1.61", "1.67"], thickness: { thicknessMm: { min: 2.1, max: 3.4 }, weight: "médio", disclaimer: "faixa estimada" } },
  oe: { index: ["1.67"], thickness: { thicknessMm: null, weight: "mais leve", disclaimer: "sem armação" } },
  alerts: ["alta miopia"],
};
const docs: LensAdvisorInput["docs"] = [
  { title: "Antirreflexo", content: "Reduz reflexos e melhora a visão noturna.", scope: "global" },
  { title: "Política da ótica", content: "Sempre oferecer garantia de 1 ano.", scope: "company" },
];

describe("explainLensRecommendation", () => {
  it("com key → chama messages.create com o model recebido, system anti-injeção e user com markers de nonce; retorna text+usage", async () => {
    mockText("As lentes recomendadas deixam o óculos mais fino e confortável.");
    const r = await explainLensRecommendation({ motor, docs }, "claude-haiku-4-5");

    expect(r.text).toBe("As lentes recomendadas deixam o óculos mais fino e confortável.");
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheTokens: 0 });

    const arg = createMock.mock.calls[0][0];
    expect(arg.model).toBe("claude-haiku-4-5");
    expect(typeof arg.system).toBe("string");
    // system instrui a explicar SEM recalcular nem contradizer o motor
    expect(arg.system).toMatch(/NUNCA recalcule|contradiga/i);
    // system instrui a cruzar o grau com as tabelas de grade (disponibilidade de produto)
    expect(arg.system).toMatch(/grade|disponibilidade|cobre|dioptria/i);
    // markers de nonce presentes no system e no user, com o mesmo nonce
    const m = arg.system.match(/«INICIO-([0-9a-f]{16})»/);
    expect(m).toBeTruthy();
    const nonce = m![1];
    expect(arg.system).toContain(`«FIM-${nonce}»`);
    expect(arg.messages[0].role).toBe("user");
    const userText = arg.messages[0].content[0].text;
    expect(userText).toContain(`«INICIO-${nonce}»`);
    expect(userText).toContain(`«FIM-${nonce}»`);
    // o resultado do motor e os docs aparecem no user
    expect(userText).toContain("1.61");
    expect(userText).toContain("Antirreflexo");
    expect(userText).toContain("alta miopia");
  });

  it("sem arg de model → usa o default LENS_ADVISOR_MODEL", async () => {
    mockText("ok");
    await explainLensRecommendation({ motor, docs });
    expect(createMock.mock.calls[0][0].model).toBe(LENS_ADVISOR_MODEL);
    expect(LENS_ADVISOR_MODEL).toBe("claude-haiku-4-5");
  });

  it("com arg de model → usa o model passado", async () => {
    mockText("ok");
    await explainLensRecommendation({ motor, docs }, "claude-sonnet-4-6");
    expect(createMock.mock.calls[0][0].model).toBe("claude-sonnet-4-6");
  });

  it("lança erro legível se getAnthropicKey retorna undefined; NÃO chama messages.create", async () => {
    (getAnthropicKey as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await expect(explainLensRecommendation({ motor, docs })).rejects.toThrow(/Anthropic API key/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("resposta sem bloco de texto → text=null defensivo, não lança", async () => {
    createMock.mockResolvedValue({ content: [], usage: { input_tokens: 5, output_tokens: 0, cache_read_input_tokens: 0 } });
    const r = await explainLensRecommendation({ motor, docs });
    expect(r.text).toBeNull();
    expect(r.usage.inputTokens).toBe(5);
  });

  it("usage ausente nos campos → cada um vira 0 (defensivo)", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], usage: {} });
    const r = await explainLensRecommendation({ motor, docs });
    expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheTokens: 0 });
  });
});
