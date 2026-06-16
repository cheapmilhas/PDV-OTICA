import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
  requireCompanyScope: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySettings: {
      upsert: vi.fn(),
    },
  },
}));

import { PATCH } from "./route";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockRequireCompanyScope = vi.mocked(requireCompanyScope);
const mockUpsert = vi.mocked(prisma.companySettings.upsert);

const adminPayload = { id: "admin-1", email: "a@a.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true };
const scopedAdmin = { id: "admin-1", role: "SUPER_ADMIN" };

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/companies/c1/ai-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/companies/[id]/ai-settings", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockRequireCompanyScope.mockReset();
    mockUpsert.mockReset();
  });

  it("401 when getAdminSession returns null", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({}), makeParams("c1"));
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("403 when requireCompanyScope returns null (out of scope)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(null);
    const res = await PATCH(makeRequest({}), makeParams("c1"));
    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("200 writes iaAvailable, iaEnabled, iaMonthlyTokenLimit to companySettings", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    const upsertResult = { companyId: "c1", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 100000 };
    mockUpsert.mockResolvedValue(upsertResult as never);

    const body = { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 100000 };
    const res = await PATCH(makeRequest(body), makeParams("c1"));
    expect(res.status).toBe(200);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "c1" },
        update: expect.objectContaining({ iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 100000 }),
        create: expect.objectContaining({ companyId: "c1", iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: 100000 }),
      })
    );

    const json = await res.json();
    expect(json.data).toEqual(upsertResult);
  });

  it("200 accepts iaMonthlyTokenLimit: null (unlimited)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    const upsertResult = { companyId: "c1", iaAvailable: true, iaEnabled: false, iaMonthlyTokenLimit: null };
    mockUpsert.mockResolvedValue(upsertResult as never);

    const body = { iaAvailable: true, iaEnabled: false, iaMonthlyTokenLimit: null };
    const res = await PATCH(makeRequest(body), makeParams("c1"));
    expect(res.status).toBe(200);

    const callUpdate = mockUpsert.mock.calls[0][0].update;
    expect(callUpdate).toHaveProperty("iaMonthlyTokenLimit", null);
  });

  it("200 grava markupPercentOverride (number) no update", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    mockUpsert.mockResolvedValue({ companyId: "c1", markupPercentOverride: 15 } as never);

    const body = { markupPercentOverride: 15 };
    await PATCH(makeRequest(body), makeParams("c1"));

    const callUpdate = mockUpsert.mock.calls[0][0].update;
    expect(callUpdate).toHaveProperty("markupPercentOverride", 15);
  });

  it("200 aceita markupPercentOverride: null (limpa o override)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    mockUpsert.mockResolvedValue({ companyId: "c1", markupPercentOverride: null } as never);

    const body = { markupPercentOverride: null };
    await PATCH(makeRequest(body), makeParams("c1"));

    const callUpdate = mockUpsert.mock.calls[0][0].update;
    expect(callUpdate).toHaveProperty("markupPercentOverride", null);
  });

  it("200 aceita markupPercentOverride negativo (subsídio)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    mockUpsert.mockResolvedValue({ companyId: "c1", markupPercentOverride: -10 } as never);

    const body = { markupPercentOverride: -10 };
    await PATCH(makeRequest(body), makeParams("c1"));

    const callUpdate = mockUpsert.mock.calls[0][0].update;
    expect(callUpdate).toHaveProperty("markupPercentOverride", -10);
  });

  it("markupPercentOverride ausente do body → não vai no update", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    mockUpsert.mockResolvedValue({ companyId: "c1", iaEnabled: true } as never);

    const body = { iaEnabled: true };
    await PATCH(makeRequest(body), makeParams("c1"));

    const callUpdate = mockUpsert.mock.calls[0][0].update;
    expect(callUpdate).not.toHaveProperty("markupPercentOverride");
  });

  it("200 only writes fields present in body", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockRequireCompanyScope.mockResolvedValue(scopedAdmin);
    mockUpsert.mockResolvedValue({ companyId: "c1", iaEnabled: true } as never);

    // Only iaEnabled in body
    const body = { iaEnabled: true };
    await PATCH(makeRequest(body), makeParams("c1"));

    const callUpdate = mockUpsert.mock.calls[0][0].update;
    expect(callUpdate).toHaveProperty("iaEnabled", true);
    expect(callUpdate).not.toHaveProperty("iaAvailable");
    expect(callUpdate).not.toHaveProperty("iaMonthlyTokenLimit");
  });
});
