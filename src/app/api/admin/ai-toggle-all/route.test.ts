import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySettings: {
      updateMany: vi.fn(),
    },
  },
}));

import { POST } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockUpdateMany = vi.mocked(prisma.companySettings.updateMany);

const adminPayload = { id: "admin-1", email: "a@a.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/ai-toggle-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/ai-toggle-all", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockUpdateMany.mockReset();
  });

  it("401 when getAdminSession returns null (updateMany not called)", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ iaAvailable: true }));
    expect(res.status).toBe(401);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("iaAvailable:true → updateMany({ data: { iaAvailable: true } }) e retorna updated", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateMany.mockResolvedValue({ count: 3 } as never);

    const res = await POST(makeRequest({ iaAvailable: true }));
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledWith({ data: { iaAvailable: true } });

    const json = await res.json();
    expect(json).toEqual({ data: { updated: 3 } });
  });

  it("iaAvailable:false → updateMany({ data: { iaAvailable: false } })", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateMany.mockResolvedValue({ count: 2 } as never);

    const res = await POST(makeRequest({ iaAvailable: false }));
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledWith({ data: { iaAvailable: false } });
  });

  it("400 quando iaAvailable não é boolean (updateMany not called)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
