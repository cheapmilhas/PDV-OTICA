import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth-helpers BEFORE imports that use them
const requireAuthMock = vi.fn();
const getCompanyIdMock = vi.fn();
const requirePermissionMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import type { NextRequest } from "next/server";
import { PUT } from "./route";
import { prisma } from "@/lib/prisma";
import { AppError, ERROR_CODES } from "@/lib/error-handler";

const mockFindUnique = vi.mocked(prisma.companySettings.findUnique);
const mockUpsert = vi.mocked(prisma.companySettings.upsert);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/company/ai-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("PUT /api/company/ai-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: "u1", companyId: "c1" } });
    getCompanyIdMock.mockResolvedValue("c1");
    requirePermissionMock.mockResolvedValue(undefined);
  });

  it("401 when requireAuth throws unauthorized", async () => {
    requireAuthMock.mockRejectedValue(new AppError(ERROR_CODES.UNAUTHORIZED, "não autenticado", 401));
    const res = await PUT(makeRequest({ iaEnabled: true }));
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("403 when requirePermission throws forbidden", async () => {
    requirePermissionMock.mockRejectedValue(new AppError(ERROR_CODES.FORBIDDEN, "sem permissão", 403));
    const res = await PUT(makeRequest({ iaEnabled: true }));
    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("403 when iaEnabled=true but iaAvailable=false in settings", async () => {
    mockFindUnique.mockResolvedValue({ iaAvailable: false } as never);
    const res = await PUT(makeRequest({ iaEnabled: true }));
    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("403 when iaEnabled=true and settings row does not exist (iaAvailable falsy)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest({ iaEnabled: true }));
    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("200 when iaEnabled=false — no availability check needed", async () => {
    mockUpsert.mockResolvedValue({ companyId: "c1", iaEnabled: false } as never);
    const res = await PUT(makeRequest({ iaEnabled: false }));
    expect(res.status).toBe(200);
    // findUnique should NOT be called when disabling (no availability guard)
    expect(mockFindUnique).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.iaEnabled).toBe(false);
  });

  it("200 writes ONLY iaEnabled (not iaAvailable or iaMonthlyTokenLimit)", async () => {
    mockFindUnique.mockResolvedValue({ iaAvailable: true } as never);
    mockUpsert.mockResolvedValue({ companyId: "c1", iaEnabled: true } as never);

    const res = await PUT(makeRequest({ iaEnabled: true, iaAvailable: true, iaMonthlyTokenLimit: 999999 }));
    expect(res.status).toBe(200);

    // Assert upsert update contains ONLY iaEnabled — not iaAvailable, not iaMonthlyTokenLimit
    const callArg = mockUpsert.mock.calls[0][0];
    expect(callArg.update).toEqual({ iaEnabled: true });
    expect(callArg.update).not.toHaveProperty("iaAvailable");
    expect(callArg.update).not.toHaveProperty("iaMonthlyTokenLimit");
  });

  it("200 when iaEnabled=true and iaAvailable=true", async () => {
    mockFindUnique.mockResolvedValue({ iaAvailable: true } as never);
    mockUpsert.mockResolvedValue({ companyId: "c1", iaEnabled: true } as never);

    const res = await PUT(makeRequest({ iaEnabled: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.iaEnabled).toBe(true);
  });
});
