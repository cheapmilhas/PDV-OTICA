import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAdminJwtSecret } from "@/lib/admin-session";

/**
 * P1 da decisão "Vis é a operadora" (forja 2026-07-16).
 *
 * O cookie do super admin NÃO pode ser assinado com o mesmo segredo do cookie
 * de tenant: quem obtivesse o do tenant forjaria um admin (30 telas, 13 óticas).
 * O pentest de 2026-06-27 apontou isso; o fallback `|| AUTH_SECRET ||
 * NEXTAUTH_SECRET` existia "durante a rotação" e virou permanente — até
 * 2026-07-16 a produção tinha SÓ NEXTAUTH_SECRET, então na prática admin e
 * tenant assinavam igual.
 *
 * Estes testes existem para que ninguém reintroduza o fallback sem quebrar a
 * suíte. É pré-condição de qualquer cookie `domain: ".vis.app.br"`.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.ADMIN_JWT_SECRET;
  delete process.env.AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("getAdminJwtSecret — segredo dedicado, sem fallback", () => {
  it("usa ADMIN_JWT_SECRET quando presente", () => {
    process.env.ADMIN_JWT_SECRET = "segredo-do-admin";
    expect(new TextDecoder().decode(getAdminJwtSecret())).toBe(
      "segredo-do-admin",
    );
  });

  it("NÃO cai em AUTH_SECRET (o fallback que anulava a separação)", () => {
    process.env.AUTH_SECRET = "segredo-do-tenant";
    expect(() => getAdminJwtSecret()).toThrow(/ADMIN_JWT_SECRET/i);
  });

  it("NÃO cai em NEXTAUTH_SECRET", () => {
    process.env.NEXTAUTH_SECRET = "segredo-do-tenant";
    expect(() => getAdminJwtSecret()).toThrow(/ADMIN_JWT_SECRET/i);
  });

  it("falha FECHADO quando não há segredo (admin fora do ar > admin forjável)", () => {
    expect(() => getAdminJwtSecret()).toThrow();
  });

  it("ignora AUTH_SECRET mesmo com ADMIN_JWT_SECRET presente (não mistura)", () => {
    process.env.ADMIN_JWT_SECRET = "segredo-do-admin";
    process.env.AUTH_SECRET = "segredo-do-tenant";
    expect(new TextDecoder().decode(getAdminJwtSecret())).toBe(
      "segredo-do-admin",
    );
  });
});
