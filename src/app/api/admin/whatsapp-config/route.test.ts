import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
vi.mock("@/lib/admin-session", () => ({ getAdminSession: () => getAdminSession() }));

const getWhatsappGlobalConfig = vi.fn();
const updateWhatsappGlobalConfig = vi.fn();
const validateWhatsappLimits = vi.fn();
vi.mock("@/services/whatsapp-config.service", () => ({
  getWhatsappGlobalConfig: (...a: unknown[]) => getWhatsappGlobalConfig(...a),
  updateWhatsappGlobalConfig: (...a: unknown[]) => updateWhatsappGlobalConfig(...a),
  validateWhatsappLimits: (...a: unknown[]) => validateWhatsappLimits(...a),
}));

const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { globalAudit: { create: (...a: unknown[]) => auditCreate(...a) } },
}));

import { PUT } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/admin/whatsapp-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/admin/whatsapp-config — role (S3)", () => {
  beforeEach(() => {
    getAdminSession.mockReset();
    getWhatsappGlobalConfig.mockReset().mockResolvedValue({ openHour: 8, closeHour: 18, dailyCap: 50 });
    updateWhatsappGlobalConfig.mockReset().mockResolvedValue({ openHour: 9 });
    validateWhatsappLimits.mockReset().mockReturnValue(null);
    auditCreate.mockReset().mockResolvedValue({});
  });

  it("401 sem sessão", async () => {
    getAdminSession.mockResolvedValue(null);
    expect((await PUT(req({ openHour: 9 }))).status).toBe(401);
  });

  it.each(["ADMIN", "SUPPORT", "BILLING"])(
    "403 para %s (config global anti-bloqueio → só SUPER_ADMIN)",
    async (role) => {
      getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role });
      expect((await PUT(req({ dailyCap: 999 }))).status).toBe(403);
      expect(updateWhatsappGlobalConfig).not.toHaveBeenCalled();
    }
  );

  it("200 para SUPER_ADMIN: atualiza e audita WHATSAPP_CONFIG_CHANGED", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "SUPER_ADMIN" });
    const res = await PUT(req({ openHour: 9 }));
    expect(res.status).toBe(200);
    expect(updateWhatsappGlobalConfig).toHaveBeenCalledWith({ openHour: 9 });
    expect(auditCreate.mock.calls[0][0].data.action).toBe("WHATSAPP_CONFIG_CHANGED");
  });
});
