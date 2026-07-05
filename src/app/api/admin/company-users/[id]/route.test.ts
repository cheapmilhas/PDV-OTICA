import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
const requireSupportScope = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  requireSupportScope: (...a: unknown[]) => requireSupportScope(...a),
}));

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    globalAudit: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));

vi.mock("@/services/activity-log.service", () => ({ logActivity: vi.fn() }));

import { PATCH } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/admin/company-users/u1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "u1" });

describe("PATCH /api/admin/company-users/[id] — escopo (S1 IDOR)", () => {
  beforeEach(() => {
    getAdminSession.mockReset();
    requireSupportScope.mockReset();
    userFindUnique.mockReset();
    userUpdate.mockReset().mockResolvedValue({});
    auditCreate.mockReset().mockResolvedValue({});
  });

  it("401 sem sessão", async () => {
    getAdminSession.mockResolvedValue(null);
    expect((await PATCH(req({ active: false }), { params })).status).toBe(401);
  });

  it("403 quando admin escopado NÃO acessa a empresa do usuário (não desativa)", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", name: "A", role: "SUPPORT" });
    userFindUnique.mockResolvedValue({
      id: "u1", name: "Vítima", email: "v@b.com", active: true, companyId: "company-B",
    });
    requireSupportScope.mockResolvedValue(null); // fora de escopo

    const res = await PATCH(req({ active: false }), { params });
    expect(res.status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(requireSupportScope).toHaveBeenCalledWith("a1", "company-B");
  });

  it("200 quando admin acessa a empresa do usuário", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", name: "A", role: "SUPPORT" });
    userFindUnique.mockResolvedValue({
      id: "u1", name: "User", email: "u@a.com", active: true, companyId: "company-A",
    });
    requireSupportScope.mockResolvedValue({ id: "a1", role: "SUPPORT" });

    const res = await PATCH(req({ active: false }), { params });
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { active: false } });
  });
});
