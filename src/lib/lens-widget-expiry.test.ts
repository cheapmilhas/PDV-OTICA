import { describe, it, expect } from "vitest";
import { isExpired, LENS_WIDGET_TTL_MS } from "./lens-widget-expiry";

describe("isExpired", () => {
  it("LENS_WIDGET_TTL_MS = 10 min", () => {
    expect(LENS_WIDGET_TTL_MS).toBe(10 * 60 * 1000);
  });
  it("nunca editado (null) → não expira (false)", () => {
    expect(isExpired(null, 1_000_000)).toBe(false);
  });
  it("dentro do TTL → false", () => {
    expect(isExpired(1_000_000, 1_000_000 + 9 * 60_000)).toBe(false);
  });
  it("além do TTL → true", () => {
    expect(isExpired(1_000_000, 1_000_000 + 11 * 60_000)).toBe(true);
  });
  it("exatamente no limite (10min) → false (só > expira)", () => {
    expect(isExpired(1_000_000, 1_000_000 + 10 * 60_000)).toBe(false);
  });
});
