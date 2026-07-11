import { describe, it, expect } from "vitest";
import { shouldRevokeForPasswordChange } from "./auth-password-revocation";

describe("shouldRevokeForPasswordChange", () => {
  const t0 = 1_000_000_000_000; // baseline do token (login)

  it("não revoga quando o banco não tem passwordChangedAt (conta nunca trocou)", () => {
    expect(shouldRevokeForPasswordChange(t0, null)).toBe(false);
    expect(shouldRevokeForPasswordChange(t0, undefined)).toBe(false);
    expect(shouldRevokeForPasswordChange(null, null)).toBe(false);
  });

  it("revoga quando a troca no banco é mais nova que o baseline do token", () => {
    const fresh = new Date(t0 + 60_000); // 1 min depois do login
    expect(shouldRevokeForPasswordChange(t0, fresh)).toBe(true);
  });

  it("não revoga quando a troca no banco é anterior ou igual ao baseline (o próprio login já reflete a troca)", () => {
    expect(shouldRevokeForPasswordChange(t0, new Date(t0))).toBe(false);
    expect(shouldRevokeForPasswordChange(t0, new Date(t0 - 60_000))).toBe(false);
  });

  it("revoga quando o token não tem baseline mas o banco registra uma troca", () => {
    const fresh = new Date(t0);
    expect(shouldRevokeForPasswordChange(null, fresh)).toBe(true);
    expect(shouldRevokeForPasswordChange(undefined, fresh)).toBe(true);
  });
});
