import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAuthMock = vi.fn();
const getCompanyIdMock = vi.fn();
const requirePermissionMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

const listMock = vi.fn();
vi.mock("@/services/whatsapp-inbox.service", () => ({
  listInboxConversations: (...a: unknown[]) => listMock(...a),
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

const req = (qs = "") => new NextRequest(`https://x/api/whatsapp/conversations${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ user: { id: "u1" } });
  getCompanyIdMock.mockResolvedValue("co1");
  requirePermissionMock.mockResolvedValue(undefined);
  listMock.mockResolvedValue([]);
});

describe("GET /api/whatsapp/conversations", () => {
  it("exige leads.access e escopa por companyId", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("leads.access");
    expect(listMock).toHaveBeenCalledWith("co1", expect.objectContaining({ status: "all" }));
  });

  it("repassa status=pending", async () => {
    await GET(req("?status=pending"));
    expect(listMock).toHaveBeenCalledWith("co1", expect.objectContaining({ status: "pending" }));
  });

  it("status inválido vira 'all'", async () => {
    await GET(req("?status=lixo"));
    expect(listMock).toHaveBeenCalledWith("co1", expect.objectContaining({ status: "all" }));
  });

  it("repassa take numérico", async () => {
    await GET(req("?take=10"));
    expect(listMock).toHaveBeenCalledWith("co1", expect.objectContaining({ take: 10 }));
  });

  it("propaga erro de permissão (não vaza dados)", async () => {
    const { AppError, ERROR_CODES } = await import("@/lib/error-handler");
    requirePermissionMock.mockRejectedValue(new AppError(ERROR_CODES.FORBIDDEN, "sem perm", 403));
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });
});
