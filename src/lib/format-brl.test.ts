import { it, expect } from "vitest";
import { brl, dateBR } from "./format-brl";

it("brl: centavos → R$ pt-BR", () => {
  expect(brl(14990)).toBe((149.9).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  expect(brl(0)).toBe((0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
});

it("dateBR: formata data curta pt-BR e aceita null", () => {
  const d = new Date("2026-07-10T12:00:00Z");
  expect(dateBR(d)).toBe(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Fortaleza" }).format(d));
  expect(dateBR(null)).toBe("");
});
