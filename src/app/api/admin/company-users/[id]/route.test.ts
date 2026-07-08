import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
const requireSupportScope = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  requireSupportScope: (...a: unknown[]) => requireSupportScope(...a),
}));

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const userCount = vi.fn();
const companyFindUnique = vi.fn();
const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
      count: (...a: unknown[]) => userCount(...a),
    },
    company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) },
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
    userCount.mockReset();
    companyFindUnique.mockReset();
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

describe("PATCH /api/admin/company-users/[id] — reativação e limite de assentos", () => {
  beforeEach(() => {
    getAdminSession.mockReset().mockResolvedValue({ id: "a1", email: "a@x", name: "A", role: "SUPPORT" });
    requireSupportScope.mockReset().mockResolvedValue({ id: "a1", role: "SUPPORT" });
    userFindUnique.mockReset().mockResolvedValue({
      id: "u1", name: "User", email: "u@a.com", active: false, companyId: "company-A",
    });
    userUpdate.mockReset().mockResolvedValue({});
    userCount.mockReset();
    companyFindUnique.mockReset();
    auditCreate.mockReset().mockResolvedValue({});
  });

  it("permite reativar em plano ILIMITADO (maxUsers === -1), mesmo com muitos ativos", async () => {
    companyFindUnique.mockResolvedValue({
      maxUsers: 3,
      subscriptions: [{ plan: { maxUsers: -1 } }],
    });
    userCount.mockResolvedValue(50); // muito acima de qualquer limite finito

    const res = await PATCH(req({ active: true }), { params });
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { active: true } });
  });

  it("bloqueia reativação quando limite finito do plano foi atingido", async () => {
    companyFindUnique.mockResolvedValue({
      maxUsers: 999,
      subscriptions: [{ plan: { maxUsers: 3 } }],
    });
    userCount.mockResolvedValue(3);

    const res = await PATCH(req({ active: true }), { params });
    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
    expect((await res.json()).error).toMatch(/Limite de 3/);
  });

  it("permite reativar quando ainda há assento livre no plano finito", async () => {
    companyFindUnique.mockResolvedValue({
      maxUsers: 999,
      subscriptions: [{ plan: { maxUsers: 5 } }],
    });
    userCount.mockResolvedValue(3);

    const res = await PATCH(req({ active: true }), { params });
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { active: true } });
  });
});
