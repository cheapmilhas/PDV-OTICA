import { describe, it, expect } from "vitest";
import { percentile } from "./percentiles";

describe("percentile", () => {
  it("retorna null para lista vazia", () => {
    expect(percentile([], 50)).toBeNull();
  });
  it("p50 de [10,20,30] é 20", () => {
    expect(percentile([10, 20, 30], 50)).toBe(20);
  });
  it("p95 escolhe o valor próximo ao topo", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(xs, 95)).toBe(95);
  });
  it("não depende da ordem de entrada", () => {
    expect(percentile([30, 10, 20], 50)).toBe(20);
  });
});
