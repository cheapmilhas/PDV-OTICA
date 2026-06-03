import { describe, it, expect } from "vitest";
import { clientIp, adminRateLimit, checkRateLimit } from "./rate-limit";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x/api", { headers });
}

describe("clientIp", () => {
  it("pega o primeiro IP de x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });
  it("cai em x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });
  it("usa 'unknown' sem headers", () => {
    expect(clientIp(req())).toBe("unknown");
  });
});

describe("checkRateLimit", () => {
  it("permite até o limite e bloqueia depois", () => {
    const key = `test-core-${Math.random()}`;
    const cfg = { maxRequests: 2, windowMs: 60_000 };
    expect(checkRateLimit(key, cfg).allowed).toBe(true);
    expect(checkRateLimit(key, cfg).allowed).toBe(true);
    expect(checkRateLimit(key, cfg).allowed).toBe(false);
  });
});

describe("adminRateLimit", () => {
  it("permite dentro do limite (retorna null)", () => {
    const r = req({ "x-forwarded-for": "1.1.1.1" });
    // chave única por teste pra não herdar contagem de outro
    const scope = `t-${Math.random()}`;
    expect(adminRateLimit(scope, "admin-1", r, { maxRequests: 3, windowMs: 60_000 })).toBeNull();
  });

  it("bloqueia com 429 ao exceder o limite", () => {
    const r = req({ "x-forwarded-for": "1.1.1.1" });
    const scope = `t-${Math.random()}`;
    const cfg = { maxRequests: 1, windowMs: 60_000 };
    expect(adminRateLimit(scope, "admin-1", r, cfg)).toBeNull(); // 1ª passa
    const blocked = adminRateLimit(scope, "admin-1", r, cfg); // 2ª bloqueia
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get("Retry-After")).toBeTruthy();
  });

  it("isola por admin: um admin não consome a cota do outro", () => {
    const r = req({ "x-forwarded-for": "1.1.1.1" });
    const scope = `t-${Math.random()}`;
    const cfg = { maxRequests: 1, windowMs: 60_000 };
    expect(adminRateLimit(scope, "admin-A", r, cfg)).toBeNull();
    // mesmo scope+ip, admin diferente → cota própria
    expect(adminRateLimit(scope, "admin-B", r, cfg)).toBeNull();
  });
});
