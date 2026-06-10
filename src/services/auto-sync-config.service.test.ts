import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { autoSyncConfig: { upsert: (...a: unknown[]) => upsert(...a) } },
}));

import { getAutoSyncConfig, updateAutoSyncConfig } from "./auto-sync-config.service";

describe("auto-sync-config.service", () => {
  beforeEach(() =>
    upsert.mockReset().mockResolvedValue({ id: "singleton", isEnabled: false, dryRun: true })
  );

  it("getAutoSyncConfig garante o singleton via upsert (create defaults, update vazio)", async () => {
    const cfg = await getAutoSyncConfig();
    expect(cfg.isEnabled).toBe(false);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "singleton" });
    expect(arg.create).toEqual({ id: "singleton" });
    expect(arg.update).toEqual({});
  });

  it("updateAutoSyncConfig aplica patch + updatedBy no mesmo singleton", async () => {
    await updateAutoSyncConfig({ isEnabled: true }, "admin-1");
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "singleton" });
    expect(arg.update).toEqual({ isEnabled: true, updatedBy: "admin-1" });
    expect(arg.create).toMatchObject({ id: "singleton", isEnabled: true, updatedBy: "admin-1" });
  });
});
