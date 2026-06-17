import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock session, knowledge service e ai-usage service. NÃO mockamos lens-optics:
// o motor PURO precisa rodar de verdade no playground.
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
}));
vi.mock("@/services/lens-knowledge.service", () => ({
  buildKnowledgeContext: vi.fn(),
  buildGlobalContext: vi.fn(),
}));
vi.mock("@/services/ai-usage.service", () => ({
  logAiUsage: vi.fn(),
}));
vi.mock("@/lib/ai/lens-advisor", () => ({
  explainLensRecommendation: vi.fn(),
}));
vi.mock("@/services/ai-config.service", () => ({
  getAiConfig: vi.fn(),
}));

import { POST } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { buildKnowledgeContext, buildGlobalContext } from "@/services/lens-knowledge.service";
import { logAiUsage } from "@/services/ai-usage.service";
import { explainLensRecommendation } from "@/lib/ai/lens-advisor";
import { getAiConfig } from "@/services/ai-config.service";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockBuildKnowledgeContext = vi.mocked(buildKnowledgeContext);
const mockBuildGlobalContext = vi.mocked(buildGlobalContext);
const mockLogAiUsage = vi.mocked(logAiUsage);
const mockExplainLensRecommendation = vi.mocked(explainLensRecommendation);
const mockGetAiConfig = vi.mocked(getAiConfig);

// advice neutro: NÃO pode conter "content"/"corpo cru" (anti-vazamento continua valendo).
const MOCK_ADVICE = "Essas lentes ficam mais finas e leves.";
const MOCK_USAGE = { inputTokens: 100, outputTokens: 50, cacheTokens: 10 };
const MOCK_CFG = { lensAdvisorModel: "claude-haiku-4-5" } as Awaited<ReturnType<typeof getAiConfig>>;

const adminPayload = { id: "admin-1", email: "a@a.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true };
const nonSuperAdmin = { id: "admin-2", email: "b@b.com", name: "Admin Comum", role: "ADMIN", isAdmin: true };

const companyCtx = {
  docs: [
    { title: "Global", content: "corpo cru global secreto", scope: "global" as const },
    { title: "Ótica A", content: "corpo cru da ótica A", scope: "company" as const },
  ],
  tokens: 42,
};

const globalCtx = {
  docs: [{ title: "Global", content: "corpo cru global secreto", scope: "global" as const }],
  tokens: 11,
};

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/ai-playground", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/ai-playground", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockBuildKnowledgeContext.mockReset();
    mockBuildGlobalContext.mockReset();
    mockLogAiUsage.mockReset();
    mockExplainLensRecommendation.mockReset();
    mockGetAiConfig.mockReset();
    mockGetAiConfig.mockResolvedValue(MOCK_CFG);
    mockExplainLensRecommendation.mockResolvedValue({ text: MOCK_ADVICE, usage: MOCK_USAGE });
  });

  it("401 quando getAdminSession retorna null", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await POST(makePostRequest({ od: { sph: -2, cyl: -1 }, oe: { sph: -2, cyl: -1 } }));
    expect(res.status).toBe(401);
    expect(mockBuildKnowledgeContext).not.toHaveBeenCalled();
    expect(mockBuildGlobalContext).not.toHaveBeenCalled();
    expect(mockLogAiUsage).not.toHaveBeenCalled();
    expect(mockExplainLensRecommendation).not.toHaveBeenCalled();
  });

  it("403 quando admin não é SUPER_ADMIN (não roda contexto)", async () => {
    mockGetAdminSession.mockResolvedValue(nonSuperAdmin);
    const res = await POST(makePostRequest({ od: { sph: -2, cyl: -1 }, oe: { sph: -2, cyl: -1 } }));
    expect(res.status).toBe(403);
    expect(mockBuildKnowledgeContext).not.toHaveBeenCalled();
    expect(mockBuildGlobalContext).not.toHaveBeenCalled();
    expect(mockExplainLensRecommendation).not.toHaveBeenCalled();
    expect(mockLogAiUsage).not.toHaveBeenCalled();
  });

  it("com companyId: roda motor real + resume buildKnowledgeContext('A')", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockBuildKnowledgeContext.mockResolvedValue(companyCtx);

    const res = await POST(
      makePostRequest({
        od: { sph: -2, cyl: -1, axis: 90 },
        oe: { sph: -2, cyl: -1, axis: 90 },
        companyId: "A",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    // motor PURO de verdade
    expect(json.data.analysis.valid).toBe(true);
    expect(Array.isArray(json.data.analysis.od.index)).toBe(true);
    expect(json.data.analysis.od.index.length).toBeGreaterThan(0);

    // contexto da ótica A (não global)
    expect(mockBuildKnowledgeContext).toHaveBeenCalledWith("A");
    expect(mockBuildGlobalContext).not.toHaveBeenCalled();

    // resumo do contexto
    expect(json.data.context.docCount).toBe(2);
    expect(json.data.context.tokens).toBe(42);
    expect(json.data.context.scopes).toEqual({ global: 1, company: 1 });

    // F3: chama Claude com o motor + os docs do contexto da ótica A, no modelo do cfg
    expect(mockExplainLensRecommendation).toHaveBeenCalledTimes(1);
    expect(mockExplainLensRecommendation).toHaveBeenCalledWith(
      { motor: json.data.analysis, docs: companyCtx.docs },
      MOCK_CFG.lensAdvisorModel
    );
    expect(json.data.advice).toBe(MOCK_ADVICE);

    // ISOLAMENTO F3: loga uso UMA vez, SEMPRE com companyId null + feature própria —
    // NUNCA com a companyId-alvo "A" (não toca a cota da ótica).
    expect(mockLogAiUsage).toHaveBeenCalledTimes(1);
    const logArg = mockLogAiUsage.mock.calls[0][0];
    expect(logArg.companyId).toBe(null);
    expect(logArg).not.toMatchObject({ companyId: "A" });
    expect(logArg).toMatchObject({
      companyId: null,
      feature: "lens_advisor_playground",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      inputTokens: MOCK_USAGE.inputTokens,
      outputTokens: MOCK_USAGE.outputTokens,
      cacheTokens: MOCK_USAGE.cacheTokens,
    });

    // ANTI-VAZAMENTO: resposta não pode conter o conteúdo cru dos docs
    const raw = JSON.stringify(json);
    expect(raw).not.toContain("content");
    expect(raw).not.toContain("corpo cru");
  });

  it("sem companyId: usa buildGlobalContext() (não buildKnowledgeContext)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockBuildGlobalContext.mockResolvedValue(globalCtx);

    const res = await POST(
      makePostRequest({ od: { sph: -1, cyl: 0 }, oe: { sph: -1, cyl: 0 } })
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockBuildGlobalContext).toHaveBeenCalledTimes(1);
    expect(mockBuildKnowledgeContext).not.toHaveBeenCalled();

    expect(json.data.context.docCount).toBe(1);
    expect(json.data.context.tokens).toBe(11);
    expect(json.data.context.scopes).toEqual({ global: 1 });

    // F3: advice presente; loga UMA vez com companyId null + feature própria
    expect(mockExplainLensRecommendation).toHaveBeenCalledWith(
      { motor: json.data.analysis, docs: globalCtx.docs },
      MOCK_CFG.lensAdvisorModel
    );
    expect(json.data.advice).toBe(MOCK_ADVICE);
    expect(mockLogAiUsage).toHaveBeenCalledTimes(1);
    expect(mockLogAiUsage.mock.calls[0][0]).toMatchObject({
      companyId: null,
      feature: "lens_advisor_playground",
    });

    // ANTI-VAZAMENTO
    const raw = JSON.stringify(json);
    expect(raw).not.toContain("content");
    expect(raw).not.toContain("corpo cru");
  });

  it("text:null de explainLensRecommendation → advice null, mas LOGA o uso (tokens consumidos)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockBuildGlobalContext.mockResolvedValue(globalCtx);
    mockExplainLensRecommendation.mockResolvedValue({
      text: null,
      usage: { inputTokens: 9, outputTokens: 0, cacheTokens: 0 },
    });

    const res = await POST(makePostRequest({ od: { sph: -1, cyl: 0 }, oe: { sph: -1, cyl: 0 } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.advice).toBe(null);

    // chamada faturável real (resolveu com text null) → LOGA o uso mesmo assim
    expect(mockLogAiUsage).toHaveBeenCalledTimes(1);
    expect(mockLogAiUsage.mock.calls[0][0]).toMatchObject({
      companyId: null,
      feature: "lens_advisor_playground",
    });
  });

  it("corpo não-JSON → 400, sem tocar IA nem log", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    const req = new Request("http://localhost/api/admin/ai-playground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "isto não é json {",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockBuildKnowledgeContext).not.toHaveBeenCalled();
    expect(mockBuildGlobalContext).not.toHaveBeenCalled();
    expect(mockExplainLensRecommendation).not.toHaveBeenCalled();
    expect(mockLogAiUsage).not.toHaveBeenCalled();
  });

  it("degradação: explainLensRecommendation rejeita → advice null, não loga, ainda 200", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockBuildKnowledgeContext.mockResolvedValue(companyCtx);
    mockExplainLensRecommendation.mockRejectedValue(new Error("Anthropic API key não configurada"));

    const res = await POST(
      makePostRequest({
        od: { sph: -2, cyl: -1, axis: 90 },
        oe: { sph: -2, cyl: -1, axis: 90 },
        companyId: "A",
      })
    );

    // motor + contexto SEMPRE voltam, mesmo sem IA
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.analysis.valid).toBe(true);
    expect(json.data.context.docCount).toBe(2);
    expect(json.data.advice).toBe(null);

    // sem chave / erro → NÃO loga (sem custo)
    expect(mockLogAiUsage).not.toHaveBeenCalled();

    // ANTI-VAZAMENTO continua valendo
    const raw = JSON.stringify(json);
    expect(raw).not.toContain("content");
    expect(raw).not.toContain("corpo cru");
  });
});
