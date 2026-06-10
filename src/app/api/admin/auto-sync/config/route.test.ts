import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
vi.mock("@/lib/admin-session", () => ({ getAdminSession: () => getAdminSession() }));

const updateAutoSyncConfig = vi.fn();
vi.mock("@/services/auto-sync-config.service", () => ({
  updateAutoSyncConfig: (...a: unknown[]) => updateAutoSyncConfig(...a),
}));

const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { globalAudit: { create: (...a: unknown[]) => auditCreate(...a) } },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

import { PATCH } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/admin/auto-sync/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/auto-sync/config", () => {
  beforeEach(() => {
    getAdminSession.mockReset();
    updateAutoSyncConfig.mockReset().mockResolvedValue({
      id: "singleton", isEnabled: true, dryRun: true, lastRunAt: null, lastRunSummary: null,
    });
    auditCreate.mockReset().mockResolvedValue({});
  });

  it("401 sem sessão", async () => {
    getAdminSession.mockResolvedValue(null);
    expect((await PATCH(req({ isEnabled: true }))).status).toBe(401);
  });

  it.each(["ADMIN", "SUPPORT", "BILLING"])("403 para %s (só SUPER_ADMIN liga/desliga)", async (role) => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role });
    expect((await PATCH(req({ isEnabled: true }))).status).toBe(403);
    expect(updateAutoSyncConfig).not.toHaveBeenCalled();
  });

  it("400 com body vazio (nada para atualizar)", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "SUPER_ADMIN" });
    expect((await PATCH(req({}))).status).toBe(400);
  });

  it("400 com body não-JSON", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "SUPER_ADMIN" });
    const bad = new Request("http://x/api/admin/auto-sync/config", { method: "PATCH", body: "not json" });
    expect((await PATCH(bad)).status).toBe(400);
  });

  it("200 para SUPER_ADMIN: atualiza e audita AUTO_SYNC_TOGGLED", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "SUPER_ADMIN" });
    const res = await PATCH(req({ isEnabled: true, dryRun: false }));
    expect(res.status).toBe(200);
    expect(updateAutoSyncConfig).toHaveBeenCalledWith({ isEnabled: true, dryRun: false }, "a1");
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit.action).toBe("AUTO_SYNC_TOGGLED");
    expect(audit.actorType).toBe("ADMIN_USER");
    expect(audit.actorId).toBe("a1");
    expect(audit.metadata).toMatchObject({ isEnabled: true, dryRun: false });
  });
});
