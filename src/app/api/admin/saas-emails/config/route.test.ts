import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
vi.mock("@/lib/admin-session", () => ({ getAdminSession: () => getAdminSession() }));

const getSaasEmailConfig = vi.fn();
const updateSaasEmailConfig = vi.fn();
vi.mock("@/services/saas-email-config.service", () => ({
  getSaasEmailConfig: () => getSaasEmailConfig(),
  updateSaasEmailConfig: (...a: unknown[]) => updateSaasEmailConfig(...a),
}));

const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { globalAudit: { create: (...a: unknown[]) => auditCreate(...a) } },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

import { GET, PATCH } from "./route";

const MOCK_CONFIG = {
  id: "singleton",
  masterEnabled: true,
  testMode: false,
  testEmail: null,
  welcomeEnabled: true,
  trialEndingEnabled: true,
  trialExpiredEnabled: true,
  invoiceOverdueEnabled: true,
  paymentConfirmedEnabled: true,
  subscriptionSuspendedEnabled: true,
  subscriptionCanceledEnabled: true,
  updatedBy: null,
  updatedAt: new Date(),
};

function req(body: unknown) {
  return new Request("http://x/api/admin/saas-emails/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/saas-emails/config", () => {
  beforeEach(() => {
    getAdminSession.mockReset();
    getSaasEmailConfig.mockReset().mockResolvedValue(MOCK_CONFIG);
    auditCreate.mockReset().mockResolvedValue({});
  });

  it("401 sem sessão", async () => {
    getAdminSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 para role ADMIN (não SUPER_ADMIN)", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x.com", name: "Admin", role: "ADMIN", isAdmin: true });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(getSaasEmailConfig).not.toHaveBeenCalled();
  });

  it("200 retorna config para SUPER_ADMIN", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(getSaasEmailConfig).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });
});

describe("PATCH /api/admin/saas-emails/config", () => {
  beforeEach(() => {
    getAdminSession.mockReset();
    updateSaasEmailConfig.mockReset().mockResolvedValue(MOCK_CONFIG);
    auditCreate.mockReset().mockResolvedValue({});
  });

  it("401 sem sessão", async () => {
    getAdminSession.mockResolvedValue(null);
    expect((await PATCH(req({ testMode: false }))).status).toBe(401);
  });

  it("403 para role ADMIN (não SUPER_ADMIN)", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x.com", name: "Admin", role: "ADMIN", isAdmin: true });
    expect((await PATCH(req({ testMode: false }))).status).toBe(403);
    expect(updateSaasEmailConfig).not.toHaveBeenCalled();
  });

  it("400 com body vazio (nada para atualizar)", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true });
    expect((await PATCH(req({}))).status).toBe(400);
  });

  it("400 com body não-JSON", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true });
    const bad = new Request("http://x/api/admin/saas-emails/config", { method: "PATCH", body: "not json" });
    expect((await PATCH(bad)).status).toBe(400);
  });

  it("200 para SUPER_ADMIN: atualiza e audita SAAS_EMAILS_CONFIG_CHANGED", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true });
    const res = await PATCH(req({ testMode: false }));
    expect(res.status).toBe(200);
    expect(updateSaasEmailConfig).toHaveBeenCalledWith({ testMode: false }, "a1");
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit.action).toBe("SAAS_EMAILS_CONFIG_CHANGED");
    expect(audit.actorType).toBe("ADMIN_USER");
    expect(audit.actorId).toBe("a1");
    expect(audit.metadata).toMatchObject({ testMode: false });
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("200 para SUPER_ADMIN: atualiza masterEnabled e audita", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true });
    const res = await PATCH(req({ masterEnabled: false, welcomeEnabled: true }));
    expect(res.status).toBe(200);
    expect(updateSaasEmailConfig).toHaveBeenCalledWith({ masterEnabled: false, welcomeEnabled: true }, "a1");
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit.metadata).toMatchObject({ masterEnabled: false, welcomeEnabled: true });
  });
});
