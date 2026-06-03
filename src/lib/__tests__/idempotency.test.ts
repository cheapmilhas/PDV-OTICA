import { describe, it, expect } from "vitest";
import { canonicalize, hashPayload } from "../idempotency";

describe("hashPayload", () => {
  it("mesmo conteúdo em ordens diferentes → mesmo hash", () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
  });

  it("conteúdo diferente → hash diferente", () => {
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });

  it("ignora campos voláteis (createdAt, timestamp, nonce...)", () => {
    expect(hashPayload({ a: 1, createdAt: "2026-01-01", nonce: "xyz" })).toBe(
      hashPayload({ a: 1 }),
    );
  });

  it("estável em arrays aninhados", () => {
    const p1 = { items: [{ id: "a", qty: 1 }, { id: "b", qty: 2 }] };
    const p2 = { items: [{ qty: 1, id: "a" }, { qty: 2, id: "b" }] };
    expect(hashPayload(p1)).toBe(hashPayload(p2));
  });

  it("ordem de itens do array IMPORTA (não reordena arrays)", () => {
    expect(hashPayload({ items: [1, 2] })).not.toBe(hashPayload({ items: [2, 1] }));
  });

  it("normaliza Decimal-like (toFixed) para string", () => {
    const decimalLike = { toFixed: () => "10.00", toString: () => "10" };
    // não lança e produz hash estável
    expect(typeof hashPayload({ amount: decimalLike })).toBe("string");
  });
});

describe("canonicalize", () => {
  it("ordena chaves de objeto", () => {
    expect(JSON.stringify(canonicalize({ c: 1, a: 2, b: 3 }))).toBe(
      JSON.stringify({ a: 2, b: 3, c: 1 }),
    );
  });

  it("remove chaves voláteis recursivamente", () => {
    const out = canonicalize({ x: 1, nested: { y: 2, updatedAt: "now" } }) as any;
    expect(out.nested.updatedAt).toBeUndefined();
    expect(out.nested.y).toBe(2);
  });

  it("Date vira ISO string", () => {
    const d = new Date("2026-06-03T00:00:00.000Z");
    expect(canonicalize({ d })).toEqual({ d: "2026-06-03T00:00:00.000Z" });
  });
});
