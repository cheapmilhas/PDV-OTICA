import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
vi.mock("@/lib/admin-session", () => ({ getAdminSession: () => getAdminSession() }));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) },
}));

import { GET } from "./route";

function req(type: string | null) {
  const url = type === null
    ? "https://x/api/admin/saas-emails/preview"
    : `https://x/api/admin/saas-emails/preview?type=${encodeURIComponent(type)}`;
  return new Request(url);
}

describe("GET /api/admin/saas-emails/preview", () => {
  beforeEach(() => getAdminSession.mockReset());

  it("401 sem sessão admin", async () => {
    getAdminSession.mockResolvedValue(null);
    const res = await GET(req("WELCOME"));
    expect(res.status).toBe(401);
  });

  it("403 para admin que não é SUPER_ADMIN", async () => {
    getAdminSession.mockResolvedValue({ id: "a", role: "ADMIN", email: "a@x", isAdmin: true });
    const res = await GET(req("WELCOME"));
    expect(res.status).toBe(403);
  });

  it("400 para tipo ausente", async () => {
    getAdminSession.mockResolvedValue({ id: "a", role: "SUPER_ADMIN", email: "a@x", isAdmin: true });
    const res = await GET(req(null));
    expect(res.status).toBe(400);
  });

  it("400 para tipo de protótipo (__proto__) — não cai em 500", async () => {
    getAdminSession.mockResolvedValue({ id: "a", role: "SUPER_ADMIN", email: "a@x", isAdmin: true });
    const res = await GET(req("__proto__"));
    expect(res.status).toBe(400);
  });

  it("400 para tipo inválido qualquer", async () => {
    getAdminSession.mockResolvedValue({ id: "a", role: "SUPER_ADMIN", email: "a@x", isAdmin: true });
    const res = await GET(req("NOPE"));
    expect(res.status).toBe(400);
  });

  it("200 com HTML para tipo válido (WELCOME)", async () => {
    getAdminSession.mockResolvedValue({ id: "a", role: "SUPER_ADMIN", email: "a@x", isAdmin: true });
    const res = await GET(req("WELCOME"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("João Silva");
  });
});
