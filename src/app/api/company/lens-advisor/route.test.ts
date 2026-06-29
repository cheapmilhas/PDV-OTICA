import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth-helpers BEFORE imports
const requireAuthMock = vi.fn();
const getCompanyIdMock = vi.fn();
const requirePermissionMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

const rateLimitResponseMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimitResponse: (...a: unknown[]) => rateLimitResponseMock(...a),
}));

const assertAiAllowedMock = vi.fn();
vi.mock("@/lib/ai-guard", () => ({
  assertAiAllowed: (...a: unknown[]) => assertAiAllowedMock(...a),
}));

const adviseForCompanyMock = vi.fn();
vi.mock("@/services/lens-advisor.service", () => ({
  adviseForCompany: (...a: unknown[]) => adviseForCompanyMock(...a),
}));

import { POST } from "./route";
import { unauthorizedError, forbiddenError, businessRuleError } from "@/lib/error-handler";

/** Keys that must NEVER appear anywhere in the response — they would leak cost/markup/tokens. */
const FORBIDDEN_KEYS = [
  "cost",
  "costUsd",
  "totalCostUsd",
  "markup",
  "markupPercent",
  "tokens",
  "inputTokens",
  "outputTokens",
  "cacheTokens",
  "usage",
] as const;

/** Recursively collect every object key found anywhere in a JSON value. */
function collectKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k);
      collectKeys(v, acc);
    }
  }
  return acc;
}

const analysisFixture = { od: { recommendedIndices: ["1.50"] }, oe: { recommendedIndices: ["1.50"] } };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/company/lens-advisor", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/company/lens-advisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: "u1", companyId: "c1" } });
    getCompanyIdMock.mockResolvedValue("c1");
    requirePermissionMock.mockResolvedValue(undefined);
    rateLimitResponseMock.mockReturnValue(null);
    assertAiAllowedMock.mockResolvedValue(undefined);
    adviseForCompanyMock.mockResolvedValue({ analysis: analysisFixture, advice: "texto" });
  });

  it("401 when requireAuth throws unauthorized; service NOT called", async () => {
    requireAuthMock.mockRejectedValue(unauthorizedError("não autenticado"));
    const res = await POST(makeRequest({ od: { sph: -2, cyl: 0 }, oe: { sph: -2, cyl: 0 } }));
    expect(res.status).toBe(401);
    expect(adviseForCompanyMock).not.toHaveBeenCalled();
  });

  it("429 when rate-limited: returns the limiter Response directly; service NOT called", async () => {
    rateLimitResponseMock.mockReturnValue(
      new Response(JSON.stringify({ error: "rl" }), { status: 429 }),
    );
    const res = await POST(makeRequest({ od: { sph: -2, cyl: 0 }, oe: { sph: -2, cyl: 0 } }));
    expect(res.status).toBe(429);
    expect(assertAiAllowedMock).not.toHaveBeenCalled();
    expect(adviseForCompanyMock).not.toHaveBeenCalled();
  });

  it("403 when assertAiAllowed throws forbidden (IA OFF); service NOT called", async () => {
    assertAiAllowedMock.mockRejectedValue(forbiddenError("IA não está disponível para esta ótica."));
    const res = await POST(makeRequest({ od: { sph: -2, cyl: 0 }, oe: { sph: -2, cyl: 0 } }));
    expect(res.status).toBe(403);
    expect(adviseForCompanyMock).not.toHaveBeenCalled();
  });

  it("400 when assertAiAllowed throws business rule (quota); service NOT called", async () => {
    assertAiAllowedMock.mockRejectedValue(businessRuleError("Cota mensal de IA atingida."));
    const res = await POST(makeRequest({ od: { sph: -2, cyl: 0 }, oe: { sph: -2, cyl: 0 } }));
    expect(res.status).toBe(400);
    expect(adviseForCompanyMock).not.toHaveBeenCalled();
  });

  it("happy: calls adviseForCompany({ companyId, od, oe, frame }) and returns { data: { analysis, advice } }", async () => {
    const res = await POST(
      makeRequest({
        od: { sph: -2.5, cyl: -1, axis: 90, add: 2 },
        oe: { sph: -3, cyl: 0 },
        frame: { lensWidthMm: 52, bridgeMm: 18 },
      }),
    );
    expect(res.status).toBe(200);

    expect(adviseForCompanyMock).toHaveBeenCalledWith({
      companyId: "c1",
      od: { sph: -2.5, cyl: -1, axis: 90, add: 2 },
      oe: { sph: -3, cyl: 0 },
      frame: { lensWidthMm: 52, bridgeMm: 18 },
    });

    const json = await res.json();
    expect(json.data.analysis).toEqual(analysisFixture);
    expect(json.data.advice).toBe("texto");
  });

  it("uses the userId as the rate-limit key", async () => {
    await POST(makeRequest({ od: { sph: -2, cyl: 0 }, oe: { sph: -2, cyl: 0 } }));
    expect(rateLimitResponseMock).toHaveBeenCalledWith(
      "lens-advisor:u1",
      expect.objectContaining({ maxRequests: expect.any(Number), windowMs: expect.any(Number) }),
    );
  });

  it("validates the body at the boundary: missing/non-numeric sph/cyl default to 0", async () => {
    await POST(makeRequest({ od: { cyl: "abc" }, oe: {} }));
    const arg = adviseForCompanyMock.mock.calls[0][0];
    expect(arg.od).toEqual({ sph: 0, cyl: 0 });
    expect(arg.oe).toEqual({ sph: 0, cyl: 0 });
  });

  it("frame is undefined unless BOTH lensWidthMm and bridgeMm are numbers", async () => {
    await POST(makeRequest({ od: { sph: -1, cyl: 0 }, oe: { sph: -1, cyl: 0 }, frame: { lensWidthMm: 52 } }));
    expect(adviseForCompanyMock.mock.calls[0][0].frame).toBeUndefined();
  });

  it("frame com medida não-finita (Infinity) é REJEITADO → adviseForCompany sem frame", async () => {
    await POST(
      makeRequest({
        od: { sph: -2, cyl: 0 },
        oe: { sph: -2, cyl: 0 },
        frame: { lensWidthMm: Infinity, bridgeMm: 18 },
      }),
    );
    expect(adviseForCompanyMock.mock.calls[0][0].frame).toBeUndefined();
  });

  it("corpo não-JSON → tratado por handleApiError (>= 400, não crash sem catch)", async () => {
    // ensure auth/rate-limit/guard mocks resolve so the JSON parse is what fails.
    // NOTE: request.json() em corpo não-JSON lança SyntaxError (instanceof Error),
    // que handleApiError mapeia para INTERNAL_ERROR/500 — então só asseguramos
    // >= 400 (erro tratado, nunca uma exceção sem try/catch).
    const res = await POST(new Request("http://localhost/api/company/lens-advisor", {
      method: "POST", body: "not-json", headers: { "Content-Type": "text/plain" },
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("CRITICAL: response body is ONLY { data: { analysis, advice, aiUnavailable, aiUnavailableReason } } — no cost/markup/tokens", async () => {
    adviseForCompanyMock.mockResolvedValue({
      analysis: analysisFixture,
      advice: "texto",
      aiUnavailable: false,
    });
    const res = await POST(makeRequest({ od: { sph: -2, cyl: 0 }, oe: { sph: -2, cyl: 0 } }));
    const json = await res.json();

    // Top-level shape is exactly { data: {...} }
    expect(Object.keys(json)).toEqual(["data"]);
    // aiUnavailableReason é uma CATEGORIA de erro segura (ex: "no_credit"),
    // nunca custo/markup/token — segue coberto pela asserção FORBIDDEN_KEYS abaixo.
    expect(Object.keys(json.data).sort()).toEqual(["advice", "aiUnavailable", "aiUnavailableReason", "analysis"]);

    const keys = collectKeys(json);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys.has(forbidden), `forbidden key leaked: ${forbidden}`).toBe(false);
    }
  });
});
