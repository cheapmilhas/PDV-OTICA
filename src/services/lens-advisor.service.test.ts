import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/lens-knowledge.service", () => ({ buildKnowledgeContext: vi.fn() }));
vi.mock("@/lib/ai/lens-advisor", () => ({ explainLensRecommendation: vi.fn() }));
vi.mock("@/services/ai-usage.service", () => ({ logAiUsage: vi.fn() }));
vi.mock("@/services/ai-config.service", () => ({ getAiConfig: vi.fn() }));

import { buildKnowledgeContext } from "@/services/lens-knowledge.service";
import { explainLensRecommendation } from "@/lib/ai/lens-advisor";
import { logAiUsage } from "@/services/ai-usage.service";
import { getAiConfig } from "@/services/ai-config.service";
import { adviseForCompany, classifyAiError } from "./lens-advisor.service";

const mockBuildCtx = buildKnowledgeContext as ReturnType<typeof vi.fn>;
const mockExplain = explainLensRecommendation as ReturnType<typeof vi.fn>;
const mockLog = logAiUsage as ReturnType<typeof vi.fn>;
const mockCfg = getAiConfig as ReturnType<typeof vi.fn>;

const od = { sph: -4, cyl: -1, axis: 90 };
const oe = { sph: -3.5, cyl: -0.5, axis: 80 };
const frame = { lensWidthMm: 52, bridgeMm: 18 };
const docs = [{ title: "Antirreflexo", content: "Reduz reflexos.", scope: "global" as const }];

beforeEach(() => {
  vi.clearAllMocks();
  mockCfg.mockResolvedValue({ lensAdvisorModel: "claude-haiku-4-5" });
  mockBuildCtx.mockResolvedValue({ docs, tokens: 42 });
  mockExplain.mockResolvedValue({
    text: "As lentes recomendadas deixam o óculos mais leve.",
    usage: { inputTokens: 100, outputTokens: 20, cacheTokens: 5 },
  });
  mockLog.mockResolvedValue(undefined);
});

describe("adviseForCompany — caminho feliz", () => {
  it("roda motor → contexto → IA → log; retorna analysis + advice", async () => {
    const r = await adviseForCompany({ companyId: "co1", od, oe, frame });

    // o motor (puro) rodou e está presente
    expect(r.analysis).toBeDefined();
    expect(r.analysis.valid).toBe(true);
    expect(r.analysis.od.index.length).toBeGreaterThan(0);
    // advice é o texto da IA
    expect(r.advice).toBe("As lentes recomendadas deixam o óculos mais leve.");
    expect(r.aiUnavailable).toBeUndefined();

    // buildKnowledgeContext chamado com o companyId
    expect(mockBuildCtx).toHaveBeenCalledWith("co1");
    // explainLensRecommendation chamado com o motor + docs e o model da config
    expect(mockExplain).toHaveBeenCalledTimes(1);
    const explainArgs = mockExplain.mock.calls[0];
    expect(explainArgs[0].motor).toBe(r.analysis);
    expect(explainArgs[0].docs).toBe(docs);
    expect(explainArgs[1]).toBe("claude-haiku-4-5");

    // logAiUsage chamado 1x com feature lens_advisor + companyId + tokens da IA
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith({
      companyId: "co1",
      feature: "lens_advisor",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      inputTokens: 100,
      outputTokens: 20,
      cacheTokens: 5,
    });
  });

  it("IA resolve com text:null (chamada faturável real) → LOGA o uso, advice null, SEM aiUnavailable", async () => {
    mockExplain.mockResolvedValue({
      text: null,
      usage: { inputTokens: 7, outputTokens: 0, cacheTokens: 0 },
    });

    const r = await adviseForCompany({ companyId: "co1", od, oe, frame });

    expect(r.analysis).toBeDefined();
    expect(r.advice).toBeNull();
    expect(r.aiUnavailable).toBeUndefined();
    // a chamada aconteceu e foi faturável → loga
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].inputTokens).toBe(7);
  });
});

describe("adviseForCompany — degradação graciosa", () => {
  it("explainLensRecommendation LANÇA (sem key) → advice null + analysis presente + aiUnavailable; NÃO loga", async () => {
    mockExplain.mockRejectedValue(new Error("Anthropic API key não configurada"));

    const r = await adviseForCompany({ companyId: "co1", od, oe, frame });

    expect(r.analysis).toBeDefined();
    expect(r.analysis.valid).toBe(true);
    expect(r.advice).toBeNull();
    expect(r.aiUnavailable).toBe(true);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("buildKnowledgeContext LANÇA → mesma degradação (advice null, analysis presente, sem log)", async () => {
    mockBuildCtx.mockRejectedValue(new Error("erro de contexto"));

    const r = await adviseForCompany({ companyId: "co1", od, oe, frame });

    expect(r.analysis).toBeDefined();
    expect(r.advice).toBeNull();
    expect(r.aiUnavailable).toBe(true);
    expect(mockExplain).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("getAiConfig LANÇA → mesma degradação", async () => {
    mockCfg.mockRejectedValue(new Error("erro de config"));

    const r = await adviseForCompany({ companyId: "co1", od, oe, frame });

    expect(r.analysis).toBeDefined();
    expect(r.advice).toBeNull();
    expect(r.aiUnavailable).toBe(true);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("sem chave → aiUnavailableReason = no_key", async () => {
    mockExplain.mockRejectedValue(new Error("Anthropic API key não configurada"));
    const r = await adviseForCompany({ companyId: "co1", od, oe, frame });
    expect(r.aiUnavailableReason).toBe("no_key");
  });

  it("erro 400 sem saldo → aiUnavailableReason = no_credit", async () => {
    const err = Object.assign(new Error("credit balance is too low"), { status: 400 });
    mockExplain.mockRejectedValue(err);
    const r = await adviseForCompany({ companyId: "co1", od, oe, frame });
    expect(r.aiUnavailableReason).toBe("no_credit");
  });

  it("erro 401 chave inválida → aiUnavailableReason = invalid_key", async () => {
    const err = Object.assign(new Error("invalid x-api-key"), { status: 401 });
    mockExplain.mockRejectedValue(err);
    const r = await adviseForCompany({ companyId: "co1", od, oe, frame });
    expect(r.aiUnavailableReason).toBe("invalid_key");
  });
});

describe("classifyAiError", () => {
  it("mensagem de 'api key não configurada' → no_key", () => {
    expect(classifyAiError(new Error("Anthropic API key não configurada"))).toBe("no_key");
  });
  it("status 401 → invalid_key", () => {
    expect(classifyAiError(Object.assign(new Error("x"), { status: 401 }))).toBe("invalid_key");
  });
  it("status 403 → invalid_key", () => {
    expect(classifyAiError(Object.assign(new Error("x"), { status: 403 }))).toBe("invalid_key");
  });
  it("status 400 + 'credit balance' → no_credit", () => {
    expect(classifyAiError(Object.assign(new Error("credit balance too low"), { status: 400 }))).toBe("no_credit");
  });
  it("'insufficient credit' sem status → no_credit", () => {
    expect(classifyAiError(new Error("insufficient credit on account"))).toBe("no_credit");
  });
  it("erro genérico (rede) → generic", () => {
    expect(classifyAiError(new Error("network timeout"))).toBe("generic");
  });
  it("não-Error → generic", () => {
    expect(classifyAiError("algo")).toBe("generic");
  });
  it("NÃO classifica 400 genérico como no_credit (precisa da pista textual)", () => {
    expect(classifyAiError(Object.assign(new Error("bad request"), { status: 400 }))).toBe("generic");
  });
});
