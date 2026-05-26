import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { serializePrisma } from "./serialize";

describe("serializePrisma", () => {
  it("converte Prisma.Decimal em number", () => {
    const dec = new Prisma.Decimal("1234.56");
    expect(serializePrisma(dec)).toBe(1234.56);
  });

  it("converte Date em ISO string", () => {
    const d = new Date("2026-05-25T12:00:00.000Z");
    expect(serializePrisma(d)).toBe("2026-05-25T12:00:00.000Z");
  });

  it("preserva null e undefined", () => {
    expect(serializePrisma(null)).toBeNull();
    expect(serializePrisma(undefined)).toBeUndefined();
  });

  it("preserva tipos primitivos", () => {
    expect(serializePrisma("foo")).toBe("foo");
    expect(serializePrisma(42)).toBe(42);
    expect(serializePrisma(true)).toBe(true);
  });

  it("BigInt seguro vira number", () => {
    expect(serializePrisma(BigInt(42))).toBe(42);
  });

  it("BigInt maior que MAX_SAFE_INTEGER vira string", () => {
    const big = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    expect(serializePrisma(big)).toBe(big.toString());
  });

  it("serializa arrays recursivamente", () => {
    const dec = new Prisma.Decimal("10.5");
    const arr = [dec, new Date("2026-01-01T00:00:00Z"), "x"];
    const result = serializePrisma(arr);
    expect(result).toEqual([10.5, "2026-01-01T00:00:00.000Z", "x"]);
  });

  it("serializa objetos aninhados", () => {
    const input = {
      id: "abc",
      price: new Prisma.Decimal("99.99"),
      createdAt: new Date("2026-05-25T00:00:00Z"),
      items: [
        { qty: 2, total: new Prisma.Decimal("199.98") },
      ],
    };
    const result = serializePrisma(input);
    expect(result).toEqual({
      id: "abc",
      price: 99.99,
      createdAt: "2026-05-25T00:00:00.000Z",
      items: [{ qty: 2, total: 199.98 }],
    });
  });

  it("não muta o objeto original", () => {
    const dec = new Prisma.Decimal("10");
    const input = { price: dec };
    serializePrisma(input);
    expect(input.price).toBe(dec); // referência preservada
  });

  it("Decimal com precisão decimal mantém valor", () => {
    const dec = new Prisma.Decimal("0.1");
    expect(serializePrisma(dec)).toBe(0.1);
  });
});
