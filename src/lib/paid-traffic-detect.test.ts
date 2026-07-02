import { describe, it, expect } from "vitest";
import { isPaidTrafficMessage } from "./paid-traffic-detect";

describe("isPaidTrafficMessage — detecção aproximada por isca", () => {
  const baits = ["quero a oferta", "vi o anúncio", "promoção"];

  it("casa isca exata (case-insensitive)", () => {
    expect(isPaidTrafficMessage("QUERO A OFERTA", baits)).toBe(true);
  });

  it("casa isca como substring dentro da mensagem", () => {
    expect(isPaidTrafficMessage("oi, vi o anúncio de vocês no face", baits)).toBe(true);
  });

  it("tolera acento (isca com acento casa texto sem, e vice-versa)", () => {
    expect(isPaidTrafficMessage("vi o anuncio", baits)).toBe(true); // texto sem acento
    expect(isPaidTrafficMessage("PROMOÇAO", ["promocao"])).toBe(true); // isca sem acento
  });

  it("tolera espaço extra", () => {
    expect(isPaidTrafficMessage("quero   a    oferta", baits)).toBe(true);
  });

  it("não casa mensagem comum sem isca", () => {
    expect(isPaidTrafficMessage("bom dia, vocês têm óculos de grau?", baits)).toBe(false);
  });

  it("lista de iscas vazia/ausente → nunca casa (detecção desligada)", () => {
    expect(isPaidTrafficMessage("quero a oferta", [])).toBe(false);
    expect(isPaidTrafficMessage("quero a oferta", null)).toBe(false);
    expect(isPaidTrafficMessage("quero a oferta", undefined)).toBe(false);
  });

  it("texto vazio/null → false", () => {
    expect(isPaidTrafficMessage("", baits)).toBe(false);
    expect(isPaidTrafficMessage(null, baits)).toBe(false);
    expect(isPaidTrafficMessage(undefined, baits)).toBe(false);
  });

  it("ignora isca curta demais (< 3 chars) — anti falso-positivo", () => {
    expect(isPaidTrafficMessage("oi tudo bem", ["oi"])).toBe(false);
    expect(isPaidTrafficMessage("bom dia", ["  ", ""])).toBe(false);
  });

  it("ignora entradas em branco na lista, mas ainda casa as válidas", () => {
    expect(isPaidTrafficMessage("promoção", ["", "  ", "promoção"])).toBe(true);
  });
});
