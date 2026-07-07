import { describe, it, expect, vi, beforeEach } from "vitest";

// Anthropic SDK mock (constructor + messages.create) — estilo lead-qualifier.test.ts
const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(_opts?: unknown) {}
    messages = { create: (...a: unknown[]) => createMock(...a) };
  },
}));

vi.mock("@/services/ai-config.service", () => ({
  getAnthropicKey: vi.fn(),
  getAiConfig: vi.fn(),
}));

const logAiUsageMock = vi.fn();
vi.mock("@/services/ai-usage.service", () => ({
  logAiUsage: (...a: unknown[]) => logAiUsageMock(...a),
}));

const requireAuthMock = vi.fn();
const getCompanyIdMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
}));

const rateLimitResponseMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimitResponse: (...a: unknown[]) => rateLimitResponseMock(...a),
}));

import { POST } from "./route";
import { getAnthropicKey, getAiConfig } from "@/services/ai-config.service";

const getAnthropicKeyMock = vi.mocked(getAnthropicKey);
const getAiConfigMock = vi.mocked(getAiConfig);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/ocr/prescription", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const USAGE = { input_tokens: 50, output_tokens: 30, cache_read_input_tokens: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ user: { id: "u1" } });
  getCompanyIdMock.mockResolvedValue("co1");
  rateLimitResponseMock.mockReturnValue(null);
  getAnthropicKeyMock.mockResolvedValue("k");
  getAiConfigMock.mockResolvedValue({
    hasKey: true,
    ocrModel: "claude-sonnet-4-6",
    qualifierModel: "claude-haiku-4-5",
    lensAdvisorModel: "claude-haiku-4-5",
    copilotModel: "claude-sonnet-4-6",
    transcriptionModel: "whisper-1",
    usdBrlRate: 5.5,
    markupPercent: 0,
    creditTokenFactor: 1000,
    hasOpenaiKey: false,
    modelPricing: [],
  });
});

describe("POST /api/ocr/prescription", () => {
  it("happy: 200, usa ocrModel configurável e mede uso", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ od: { esf: -2 }, oe: { esf: -2 } }) }],
      usage: USAGE,
    });

    const res = await POST(makeRequest({ imageBase64: "QUJD", mimeType: "image/png" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { od: { esf: -2 }, oe: { esf: -2 } } });

    // O model passado à API é o configurável, NÃO o hardcoded antigo
    const callArg = createMock.mock.calls[0][0];
    expect(callArg.model).toBe("claude-sonnet-4-6");

    // logAiUsage recebe feature/model/companyId/tokens corretos
    expect(logAiUsageMock).toHaveBeenCalledTimes(1);
    const usageArg = logAiUsageMock.mock.calls[0][0];
    expect(usageArg).toMatchObject({
      feature: "ocr_prescription",
      model: "claude-sonnet-4-6",
      companyId: "co1",
      inputTokens: 50,
      outputTokens: 30,
      cacheTokens: 0,
    });
  });

  it("no key: 503, NÃO chama a API nem mede uso", async () => {
    getAnthropicKeyMock.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ imageBase64: "QUJD", mimeType: "image/png" }));
    expect(res.status).toBe(503);
    expect(createMock).not.toHaveBeenCalled();
    expect(logAiUsageMock).not.toHaveBeenCalled();
  });

  it("rate-limited: retorna 429, NÃO chama a API", async () => {
    rateLimitResponseMock.mockReturnValue(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 })
    );
    const res = await POST(makeRequest({ imageBase64: "QUJD", mimeType: "image/png" }));
    expect(res.status).toBe(429);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("missing image: 400, NÃO chama a API", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("bad JSON do modelo: 422 (parse defensivo)", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "não é json" }],
      usage: USAGE,
    });
    const res = await POST(makeRequest({ imageBase64: "QUJD", mimeType: "image/png" }));
    expect(res.status).toBe(422);
  });
});
