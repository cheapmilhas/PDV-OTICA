import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
}));
vi.mock("@/services/ai-companies-overview.service", () => ({
  getAllCompaniesAiOverview: vi.fn(),
}));

import { GET } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { getAllCompaniesAiOverview } from "@/services/ai-companies-overview.service";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockGetOverview = vi.mocked(getAllCompaniesAiOverview);

const superAdmin = { id: "a1", email: "a@a.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true };

beforeEach(() => {
  mockGetAdminSession.mockReset();
  mockGetOverview.mockReset();
});

describe("GET /api/admin/ai-companies-overview", () => {
  it("401 quando não há sessão de admin", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetOverview).not.toHaveBeenCalled();
  });

  it("403 quando admin não é SUPER_ADMIN", async () => {
    mockGetAdminSession.mockResolvedValue({ ...superAdmin, role: "SUPPORT" });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockGetOverview).not.toHaveBeenCalled();
  });

  it("200 devolve as linhas do serviço para o super admin", async () => {
    mockGetAdminSession.mockResolvedValue(superAdmin);
    const fixture = [
      {
        companyId: "co1",
        companyName: "Ótica A",
        iaAvailable: true,
        iaEnabled: true,
        iaMonthlyTokenLimit: null,
        markupPercentOverride: null,
        totalTokens: 1000,
        totalCostUsd: 0.5,
        costBrlReal: 2.75,
        markupPercent: 100,
        priceBrl: 5.5,
        lucroBrl: 2.75,
      },
    ];
    mockGetOverview.mockResolvedValue(fixture);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual(fixture);
    expect(mockGetOverview).toHaveBeenCalledOnce();
  });
});
