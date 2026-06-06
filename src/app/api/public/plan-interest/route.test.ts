import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { planInterest: { upsert: (...a: unknown[]) => upsert(...a) } } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/public/plan-interest", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/public/plan-interest", () => {
  beforeEach(() => upsert.mockReset());

  it("rejeita email inválido com 400", async () => {
    const res = await POST(req({ planSlug: "profissional", name: "Ana", email: "x" }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upsert por (email, planSlug) e responde 200", async () => {
    upsert.mockResolvedValue({ id: "1" });
    const res = await POST(req({ planSlug: "profissional", name: "Ana", email: "ana@x.com" }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ email_planSlug: { email: "ana@x.com", planSlug: "profissional" } });
  });
});
