import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
}));
vi.mock("@/services/ai-config.service", () => ({
  getAiConfig: vi.fn(),
  updateAiConfig: vi.fn(),
  QUALIFIER_MODELS: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"],
  TRANSCRIPTION_MODELS: ["whisper-1"],
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { globalAudit: { create: vi.fn().mockResolvedValue({}) } },
}));

import { GET, PUT } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { getAiConfig, updateAiConfig } from "@/services/ai-config.service";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockGetAiConfig = vi.mocked(getAiConfig);
const mockUpdateAiConfig = vi.mocked(updateAiConfig);

const adminPayload = { id: "admin-1", email: "a@a.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true };

const viewFixture = {
  hasKey: true,
  usdBrlRate: 5.5,
  markupPercent: 20,
  creditTokenFactor: 1000,
  qualifierModel: "claude-haiku-4-5",
  lensAdvisorModel: "claude-haiku-4-5",
  ocrModel: "claude-sonnet-4-6",
  copilotModel: "claude-sonnet-4-6",
  transcriptionModel: "whisper-1",
  hasOpenaiKey: false,
  modelPricing: [],
};

function makeGetRequest() {
  return new Request("http://localhost/api/admin/ai-config", { method: "GET" });
}

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/admin/ai-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/ai-config", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockGetAiConfig.mockReset();
    mockUpdateAiConfig.mockReset();
  });

  it("401 when getAdminSession returns null", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(mockGetAiConfig).not.toHaveBeenCalled();
  });

  it("200 returns view without exposing key or anthropicKeyEnc", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockGetAiConfig.mockResolvedValue(viewFixture);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toEqual(viewFixture);
    // Route must NOT include raw key fields — getAiConfig only returns the view
    expect(json.data).not.toHaveProperty("anthropicKeyEnc");
    expect(json.data).not.toHaveProperty("anthropicKey");
  });
});

describe("PUT /api/admin/ai-config", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockGetAiConfig.mockReset();
    mockUpdateAiConfig.mockReset();
  });

  it("401 when getAdminSession returns null", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ usdBrlRate: 5.8 }));
    expect(res.status).toBe(401);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "SUPPORT", "BILLING"])(
    "403 para %s (grava chave de API global → só SUPER_ADMIN)",
    async (role) => {
      mockGetAdminSession.mockResolvedValue({ ...adminPayload, role });
      const res = await PUT(makePutRequest({ anthropicKey: "sk-leak" }));
      expect(res.status).toBe(403);
      expect(mockUpdateAiConfig).not.toHaveBeenCalled();
    }
  );

  it("200 calls updateAiConfig with body fields and returns data", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    const updatedView = { ...viewFixture, usdBrlRate: 5.8, markupPercent: 25 };
    mockUpdateAiConfig.mockResolvedValue(updatedView);

    const body = { usdBrlRate: 5.8, markupPercent: 25, anthropicKey: "sk-test" };
    const res = await PUT(makePutRequest(body));
    expect(res.status).toBe(200);

    expect(mockUpdateAiConfig).toHaveBeenCalledWith({
      usdBrlRate: 5.8,
      markupPercent: 25,
      anthropicKey: "sk-test",
    });

    const json = await res.json();
    expect(json.data).toEqual(updatedView);
  });

  it("400 em creditTokenFactor=0 (divisor → Infinity/NaN) — não salva nada", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ creditTokenFactor: 0 }));
    expect(res.status).toBe(400);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });

  it("400 em usdBrlRate/markupPercent negativos (custo R$ negativo) — não salva", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ usdBrlRate: -1, markupPercent: -5 }));
    expect(res.status).toBe(400);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });

  it("encaminha qualifierModel válido (allowlist) para updateAiConfig", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ qualifierModel: "claude-sonnet-4-6" }));
    expect(res.status).toBe(200);
    const callArg = mockUpdateAiConfig.mock.calls[0][0];
    expect(callArg).toHaveProperty("qualifierModel", "claude-sonnet-4-6");
  });

  it("400 em qualifierModel fora da allowlist (ex: gpt-4) — não salva", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ qualifierModel: "gpt-4" }));
    expect(res.status).toBe(400);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });

  it("encaminha lensAdvisorModel válido (allowlist) para updateAiConfig", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ lensAdvisorModel: "claude-sonnet-4-6" }));
    expect(res.status).toBe(200);
    const callArg = mockUpdateAiConfig.mock.calls[0][0];
    expect(callArg).toHaveProperty("lensAdvisorModel", "claude-sonnet-4-6");
  });

  it("400 em lensAdvisorModel fora da allowlist (ex: gpt-4) — não salva", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ lensAdvisorModel: "gpt-4" }));
    expect(res.status).toBe(400);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });

  it("encaminha ocrModel válido (allowlist) para updateAiConfig", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ ocrModel: "claude-sonnet-4-6" }));
    expect(res.status).toBe(200);
    const callArg = mockUpdateAiConfig.mock.calls[0][0];
    expect(callArg).toHaveProperty("ocrModel", "claude-sonnet-4-6");
  });

  it("400 em ocrModel fora da allowlist (ex: gpt-4) — não salva", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ ocrModel: "gpt-4" }));
    expect(res.status).toBe(400);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });

  it("encaminha openaiKey (string) para updateAiConfig", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ openaiKey: "sk-openai-test" }));
    expect(res.status).toBe(200);
    const callArg = mockUpdateAiConfig.mock.calls[0][0];
    expect(callArg).toHaveProperty("openaiKey", "sk-openai-test");
  });

  it("400 quando um campo tem tipo errado (usdBrlRate string) — não salva", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    // Antes: descartava usdBrlRate em silêncio e salvava o resto com 200.
    // Agora: valor inválido → 400, nada salvo (o operador vê o erro).
    const res = await PUT(makePutRequest({ creditTokenFactor: 500, usdBrlRate: "not-a-number" }));
    expect(res.status).toBe(400);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });

  it("400 em JSON malformado no corpo", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    const req = new Request("http://localhost/api/admin/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{ isso não é json",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });

  it("encaminha copilotModel válido (allowlist Claude) para updateAiConfig", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ copilotModel: "claude-opus-4-8" }));
    expect(res.status).toBe(200);
    expect(mockUpdateAiConfig.mock.calls[0][0]).toHaveProperty("copilotModel", "claude-opus-4-8");
  });

  it("400 em copilotModel fora da allowlist (ex: whisper-1 não é Claude)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ copilotModel: "whisper-1" }));
    expect(res.status).toBe(400);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });

  it("encaminha transcriptionModel válido (whisper-1) para updateAiConfig", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ transcriptionModel: "whisper-1" }));
    expect(res.status).toBe(200);
    expect(mockUpdateAiConfig.mock.calls[0][0]).toHaveProperty("transcriptionModel", "whisper-1");
  });

  it("400 em transcriptionModel fora da allowlist (ex: claude não transcreve)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateAiConfig.mockResolvedValue(viewFixture);
    const res = await PUT(makePutRequest({ transcriptionModel: "claude-haiku-4-5" }));
    expect(res.status).toBe(400);
    expect(mockUpdateAiConfig).not.toHaveBeenCalled();
  });
});
