import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { saasEmailConfig: { upsert: (...a: unknown[]) => upsert(...a) } },
}));

import { getSaasEmailConfig, updateSaasEmailConfig } from "./saas-email-config.service";

describe("saas-email-config.service", () => {
  beforeEach(() => upsert.mockReset());

  it("getSaasEmailConfig faz upsert do singleton e retorna o registro", async () => {
    upsert.mockResolvedValue({ id: "singleton", masterEnabled: true, testMode: true });
    const cfg = await getSaasEmailConfig();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "singleton" }, create: { id: "singleton" } })
    );
    expect(cfg.testMode).toBe(true);
  });

  it("updateSaasEmailConfig aplica o patch e registra updatedBy", async () => {
    upsert.mockResolvedValue({ id: "singleton", testMode: false });
    await updateSaasEmailConfig({ testMode: false }, "admin-1");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "singleton" },
        update: { testMode: false, updatedBy: "admin-1" },
      })
    );
  });
});
