import { describe, it, expect, vi, beforeEach } from "vitest";
const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor(_opts?: unknown) {} messages = { create: (...a: unknown[]) => createMock(...a) }; } }));
vi.mock("@/services/ai-config.service", () => ({ getAnthropicKey: vi.fn() }));
import { getAnthropicKey } from "@/services/ai-config.service";
import { qualifyConversationText, SYSTEM_PROMPT } from "./lead-qualifier";

beforeEach(() => {
  vi.clearAllMocks();
  (getAnthropicKey as ReturnType<typeof vi.fn>).mockResolvedValue("test-key");
});
function mockJson(obj: unknown, usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0 }) {
  createMock.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(obj) }], usage });
}

describe("qualifyConversationText", () => {
  it("isLead=true → interesse + stageId mapeado + usage; usa claude-sonnet-4-6 e system prompt", async () => {
    mockJson({ intent: "NOVA_COMPRA", isLead: true, reason: "quer óculos de grau", interest: "grau", suggestedStageName: "Novo", confidence: 0.9 });
    const r = await qualifyConversationText("quanto custa um óculos de grau?", [{ id: "s_novo", name: "Novo" }, { id: "s2", name: "Em atendimento" }]);
    expect(r.isLead).toBe(true);
    expect(r.interest).toBe("grau");
    expect(r.intent).toBe("NOVA_COMPRA");
    expect(r.stageId).toBe("s_novo");
    expect(r.usage.inputTokens).toBe(100);
    const arg = createMock.mock.calls[0][0];
    expect(arg.model).toBe("claude-sonnet-4-6");
    expect(typeof arg.system).toBe("string");
    expect(arg.messages[0].role).toBe("user");
    // temperature=0: classificação determinística e reproduzível (Item 3).
    expect(arg.temperature).toBe(0);
  });

  it("SYSTEM_PROMPT traz as regras de desempate D0-D4 (Item 3)", () => {
    expect(SYSTEM_PROMPT).toContain("REGRAS DE DESEMPATE");
    expect(SYSTEM_PROMPT).toContain("SAUDAÇÃO/VAZIO");
    expect(SYSTEM_PROMPT).toContain("RENOVACAO"); // D2 refazer
    expect(SYSTEM_PROMPT).toContain("CONSULTA/EXAME EXTERNO"); // D4
  });
  it("sem arg de model → usa o default claude-sonnet-4-6", async () => {
    mockJson({ intent: "OUTRO", isLead: false, reason: "x", confidence: 0.5 });
    await qualifyConversationText("oi", [{ id: "s_novo", name: "Novo" }]);
    expect(createMock.mock.calls[0][0].model).toBe("claude-sonnet-4-6");
  });
  it("com arg de model → usa o model passado", async () => {
    mockJson({ intent: "OUTRO", isLead: false, reason: "x", confidence: 0.5 });
    await qualifyConversationText("oi", [{ id: "s_novo", name: "Novo" }], "claude-haiku-4-5");
    expect(createMock.mock.calls[0][0].model).toBe("claude-haiku-4-5");
  });
  it("isLead=false → stageId null", async () => {
    mockJson({ intent: "AGENDAMENTO_INFO", isLead: false, reason: "horário", confidence: 0.8 });
    const r = await qualifyConversationText("que horas abrem?", [{ id: "s_novo", name: "Novo" }]);
    expect(r.isLead).toBe(false);
    expect(r.stageId).toBeNull();
  });
  it("lead SEMPRE nasce no 1º estágio aberto — IGNORA o chute de stage da IA", async () => {
    // 🐛 Bug Delene: o cliente cotou "220,00" e a IA cravou "Orçamento enviado" no
    // nascimento, pulando etapas. Agora o nascimento ignora suggestedStageName e
    // usa o 1º estágio ABERTO (Novo); o avanço fica SÓ com a régua objetiva.
    const STAGES = [
      { id: "s_novo", name: "Novo", order: 0, isWon: false, isLost: false },
      { id: "s_atend", name: "Em atendimento", order: 1, isWon: false, isLost: false },
      { id: "s_orc", name: "Orçamento enviado", order: 2, isWon: false, isLost: false },
      { id: "s_fechado", name: "Fechado", order: 3, isWon: true, isLost: false },
    ];
    mockJson({ intent: "ORCAMENTO_PRECO", isLead: true, reason: "lead", suggestedStageName: "Orçamento enviado", confidence: 0.9 });
    const r = await qualifyConversationText("220,00 a vista ou no Pix", STAGES);
    expect(r.stageId).toBe("s_novo"); // NÃO "s_orc"
  });

  it("1º estágio aberto = menor order NÃO-terminal (mesmo desordenado)", async () => {
    const STAGES = [
      { id: "s_fechado", name: "Fechado", order: 3, isWon: true, isLost: false },
      { id: "s_atend", name: "Em atendimento", order: 1, isWon: false, isLost: false },
      { id: "s_novo", name: "Novo", order: 0, isWon: false, isLost: false },
    ];
    mockJson({ intent: "NOVA_COMPRA", isLead: true, reason: "lead", confidence: 0.7 });
    const r = await qualifyConversationText("quero lente de contato", STAGES);
    expect(r.stageId).toBe("s_novo");
  });

  // --- Fase 1: intenção, saneamento e contexto do cliente ---
  it("intenção de NÃO-VENDA força isLead=false mesmo se a IA disser true", async () => {
    mockJson({ intent: "RECLAMACAO", isLead: true, reason: "cliente bravo", confidence: 0.9 });
    const r = await qualifyConversationText("péssimo atendimento", [{ id: "s_novo", name: "Novo" }]);
    expect(r.intent).toBe("RECLAMACAO");
    expect(r.isLead).toBe(false); // backend decide, não a IA
    expect(r.stageId).toBeNull();
  });
  it("intent fora da allowlist → OUTRO (e não-venda)", async () => {
    mockJson({ intent: "INTENCAO_INVENTADA", isLead: true, reason: "x", confidence: 0.8 });
    const r = await qualifyConversationText("oi", [{ id: "s_novo", name: "Novo" }]);
    expect(r.intent).toBe("OUTRO");
    expect(r.isLead).toBe(false);
  });
  it("confidence fora de 0-1 é clampado", async () => {
    mockJson({ intent: "NOVA_COMPRA", isLead: true, reason: "x", confidence: 5 });
    const r = await qualifyConversationText("quero comprar", [{ id: "s_novo", name: "Novo" }]);
    expect(r.confidence).toBe(1);
  });
  it("contactNotPatient e urgent são capturados", async () => {
    mockJson({ intent: "NOVA_COMPRA", isLead: true, reason: "pro filho", confidence: 0.8, contactNotPatient: true, urgent: true });
    const r = await qualifyConversationText("é pro meu filho, urgente", [{ id: "s_novo", name: "Novo" }]);
    expect(r.contactNotPatient).toBe(true);
    expect(r.urgent).toBe(true);
  });
  it("resumo seguro do cliente entra no prompt como DICA fora dos marcadores", async () => {
    mockJson({ intent: "RENOVACAO", isLead: true, reason: "renova", confidence: 0.8 });
    await qualifyConversationText("quero trocar meu óculos", [{ id: "s_novo", name: "Novo" }], "claude-haiku-4-5", {
      purchaseCount: 3, daysSinceLastPurchase: 400, openServiceOrder: null, isRecurring: true,
    });
    const prompt = createMock.mock.calls[0][0].messages[0].content[0].text;
    expect(prompt).toContain("DADOS DA ÓTICA SOBRE ESTE CONTATO");
    expect(prompt).toContain("compras concluídas=3");
    // a dica vem ANTES dos marcadores de conversa (não é texto do cliente)
    expect(prompt.indexOf("DADOS DA ÓTICA")).toBeLessThan(prompt.indexOf("«INICIO-"));
  });
  it("intent ausente no JSON → OUTRO (não quebra)", async () => {
    mockJson({ isLead: true, reason: "x", confidence: 0.5 });
    const r = await qualifyConversationText("oi", [{ id: "s_novo", name: "Novo" }]);
    expect(r.intent).toBe("OUTRO");
    expect(r.isLead).toBe(false);
  });
  it("lança erro legível se getAnthropicKey retorna undefined (key ausente)", async () => {
    (getAnthropicKey as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await expect(qualifyConversationText("oi", [{ id: "s_novo", name: "Novo" }])).rejects.toThrow(/Anthropic API key|ANTHROPIC_API_KEY/);
  });

  it("JSON inválido → isLead=false defensivo (parseError, não lança)", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "não é json" }], usage: { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0 } });
    const r = await qualifyConversationText("oi", [{ id: "s_novo", name: "Novo" }]);
    expect(r.isLead).toBe(false);
    expect(r.parseError).toBe(true);
  });

  // LGPD: o prompt DEVE instruir a IA a não colocar PII/saúde no "reason"
  // (o motivo é exibido a funcionários da ótica). Regressão p/ não remover.
  it("SYSTEM_PROMPT instrui a não incluir nome/saúde no reason (LGPD)", () => {
    expect(SYSTEM_PROMPT).toContain("LGPD");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("nomes de");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("saúde");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("nunca inclua");
  });
});
