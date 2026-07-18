import { describe, it, expect } from "vitest";
import { signVisDomus, verifyVisDomus } from "@/lib/vis-domus-hmac";

const SECRET = "test-secret-123";
const body = JSON.stringify({ eventId: "evt_1", writeAllowed: true });

describe("vis-domus HMAC — assinatura e verificação", () => {
  it("assina e verifica o mesmo corpo/timestamp", () => {
    const ts = 1_700_000_000_000;
    const sig = signVisDomus(SECRET, ts, body);
    expect(verifyVisDomus(SECRET, ts, body, sig, ts).ok).toBe(true);
  });

  it("rejeita assinatura de corpo diferente (adulteração)", () => {
    const ts = 1_700_000_000_000;
    const sig = signVisDomus(SECRET, ts, body);
    const r = verifyVisDomus(SECRET, ts, body + "x", sig, ts);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("mismatch");
  });

  it("rejeita segredo errado", () => {
    const ts = 1_700_000_000_000;
    const sig = signVisDomus(SECRET, ts, body);
    expect(verifyVisDomus("outro-segredo", ts, body, sig, ts).ok).toBe(false);
  });

  it("rejeita timestamp fora da janela de 5 min (replay velho)", () => {
    const ts = 1_700_000_000_000;
    const sig = signVisDomus(SECRET, ts, body);
    const now = ts + 6 * 60 * 1000; // 6 min depois
    const r = verifyVisDomus(SECRET, ts, body, sig, now);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("stale");
  });

  it("rejeita timestamp muito no futuro (relógio adulterado)", () => {
    const ts = 1_700_000_000_000;
    const sig = signVisDomus(SECRET, ts, body);
    const now = ts - 6 * 60 * 1000; // ts 6 min no futuro
    expect(verifyVisDomus(SECRET, ts, body, sig, now).ok).toBe(false);
  });

  it("rejeita header de assinatura ausente", () => {
    expect(verifyVisDomus(SECRET, 1_700_000_000_000, body, null, 1_700_000_000_000).ok).toBe(false);
  });

  it("a assinatura cobre o timestamp: mudar o ts invalida", () => {
    const ts = 1_700_000_000_000;
    const sig = signVisDomus(SECRET, ts, body);
    // mesmo dentro da janela, um ts diferente do assinado não valida
    const r = verifyVisDomus(SECRET, ts + 1000, body, sig, ts + 1000);
    expect(r.ok).toBe(false);
  });
});
