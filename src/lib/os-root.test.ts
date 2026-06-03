import { describe, it, expect } from "vitest";
import { resolveRootOrderId } from "./os-root";

describe("resolveRootOrderId", () => {
  it("OS original (sem originalOrderId) → ela mesma é a raiz", () => {
    expect(resolveRootOrderId({ id: "os-15", originalOrderId: null })).toBe("os-15");
  });

  it("derivação direta (retrabalho da raiz) → raiz é o originalOrderId", () => {
    expect(resolveRootOrderId({ id: "os-rt", originalOrderId: "os-15" })).toBe("os-15");
  });

  it("derivação de derivação (garantia feita a partir de um retrabalho) → ainda a raiz", () => {
    // O retrabalho 'os-rt' já aponta à raiz 'os-15'; uma garantia criada a
    // partir dele deve herdar 'os-15', não 'os-rt' (senão #000018-G).
    expect(resolveRootOrderId({ id: "os-g", originalOrderId: "os-15" })).toBe("os-15");
  });

  it("originalOrderId undefined → ela mesma é a raiz", () => {
    expect(resolveRootOrderId({ id: "os-15" })).toBe("os-15");
  });
});
