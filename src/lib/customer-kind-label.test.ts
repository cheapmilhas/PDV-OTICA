import { describe, it, expect } from "vitest";
import { customerKind } from "./customer-kind-label";

describe("customerKind — etiqueta de tipo de cliente (derivada de compras)", () => {
  it("sem compra ou não identificado → cliente novo", () => {
    expect(customerKind(0).kind).toBe("novo");
    expect(customerKind(null).kind).toBe("novo");
    expect(customerKind(undefined).kind).toBe("novo");
    expect(customerKind(0).label).toBe("Cliente novo");
  });

  it("exatamente 1 compra → comprou 1×", () => {
    expect(customerKind(1).kind).toBe("comprou_1x");
    expect(customerKind(1).label).toBe("Comprou 1×");
  });

  it("2 ou mais compras → cliente habitual", () => {
    expect(customerKind(2).kind).toBe("habitual");
    expect(customerKind(10).kind).toBe("habitual");
    expect(customerKind(2).label).toBe("Cliente habitual");
  });
});
