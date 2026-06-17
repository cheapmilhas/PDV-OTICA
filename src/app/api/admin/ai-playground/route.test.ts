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

import { POST } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { buildKnowledgeContext, buildGlobalContext } from "@/services/lens-knowledge.service";
import { logAiUsage } from "@/services/ai-usage.service";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockBuildKnowledgeContext = vi.mocked(buildKnowledgeContext);
const mockBuildGlobalContext = vi.mocked(buildGlobalContext);
const mockLogAiUsage = vi.mocked(logAiUsage);

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
  });

  it("401 quando getAdminSession retorna null", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await POST(makePostRequest({ od: { sph: -2, cyl: -1 }, oe: { sph: -2, cyl: -1 } }));
    expect(res.status).toBe(401);
    expect(mockBuildKnowledgeContext).not.toHaveBeenCalled();
    expect(mockBuildGlobalContext).not.toHaveBeenCalled();
    expect(mockLogAiUsage).not.toHaveBeenCalled();
  });

  it("403 quando admin não é SUPER_ADMIN (não roda contexto)", async () => {
    mockGetAdminSession.mockResolvedValue(nonSuperAdmin);
    const res = await POST(makePostRequest({ od: { sph: -2, cyl: -1 }, oe: { sph: -2, cyl: -1 } }));
    expect(res.status).toBe(403);
    expect(mockBuildKnowledgeContext).not.toHaveBeenCalled();
    expect(mockBuildGlobalContext).not.toHaveBeenCalled();
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

    // ISOLAMENTO: F2 NÃO loga uso (sem custo real)
    expect(mockLogAiUsage).not.toHaveBeenCalled();

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

    // ISOLAMENTO
    expect(mockLogAiUsage).not.toHaveBeenCalled();

    // ANTI-VAZAMENTO
    const raw = JSON.stringify(json);
    expect(raw).not.toContain("content");
    expect(raw).not.toContain("corpo cru");
  });
});
