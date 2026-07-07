import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemEvent: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { prisma } from "@/lib/prisma";
import { createEvent, ensureAutoEvent, resolveEvent, listEvents } from "./system-event.service";

const create = prisma.systemEvent.create as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.systemEvent.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.systemEvent.update as unknown as ReturnType<typeof vi.fn>;

const base = {
  id: "e1", source: "manual", severity: "warning", title: "t", detail: null,
  status: "open", resolvedAt: null, resolvedBy: null, resolveNote: null, createdAt: new Date("2026-07-07T00:00:00Z"),
};

beforeEach(() => vi.clearAllMocks());

describe("createEvent (manual)", () => {
  it("cria com source/severity/title", async () => {
    create.mockResolvedValue(base);
    const v = await createEvent({ source: "manual", severity: "warning", title: "t" });
    expect(v.id).toBe("e1");
    expect(create.mock.calls[0][0].data.source).toBe("manual");
  });
});

describe("ensureAutoEvent (idempotente)", () => {
  it("se já há evento ABERTO com a dedupeKey, NÃO cria outro", async () => {
    findFirst.mockResolvedValue({ ...base, dedupeKey: "vercel-block" });
    const v = await ensureAutoEvent("vercel-block", () => ({ source: "vercel", severity: "critical", title: "x" }));
    expect(create).not.toHaveBeenCalled();
    expect(v?.id).toBe("e1");
  });
  it("se não há aberto, cria com a dedupeKey", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ ...base, dedupeKey: "cron-dead" });
    await ensureAutoEvent("cron-dead", () => ({ source: "cron", severity: "critical", title: "morto" }));
    expect(create.mock.calls[0][0].data.dedupeKey).toBe("cron-dead");
  });
});

describe("resolveEvent", () => {
  it("marca resolved + guarda quem/quando/nota (não apaga)", async () => {
    update.mockResolvedValue({ ...base, status: "resolved", resolvedBy: "admin1", resolveNote: "reduzi polling" });
    const v = await resolveEvent("e1", "admin1", "reduzi polling");
    expect(update.mock.calls[0][0].data.status).toBe("resolved");
    expect(update.mock.calls[0][0].data.resolvedBy).toBe("admin1");
    expect(v.resolveNote).toBe("reduzi polling");
  });
});

describe("listEvents", () => {
  it("retorna abertos + resolvidos + contagem de abertos", async () => {
    (prisma.systemEvent.findMany as any).mockResolvedValueOnce([base]).mockResolvedValueOnce([]);
    (prisma.systemEvent.count as any).mockResolvedValue(1);
    const r = await listEvents();
    expect(r.open).toHaveLength(1);
    expect(r.openCount).toBe(1);
  });
});
