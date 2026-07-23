import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { plan: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { GET } from "./route";

describe("GET /api/public/plans", () => {
  beforeEach(() => findMany.mockReset());

  it("filtra SÓ planos da ótica (VIS_APP) — planos medical nunca vazam pro funil ótico (P0 Fase 0)", async () => {
    findMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledOnce();
    const arg = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(arg.where).toEqual({ isActive: true, platformProduct: "VIS_APP" });
  });

  it("responde a lista de planos com cache curto", async () => {
    findMany.mockResolvedValue([{ id: "p1", name: "Básico" }]);
    const res = await GET();
    const body = await res.json();
    expect(body.plans).toHaveLength(1);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
  });
});
