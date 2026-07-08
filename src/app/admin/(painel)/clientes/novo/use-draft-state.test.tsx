/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraftState, useClearDraft } from "./use-draft-state";

const PREFIX = "admin:new-client-draft:";

describe("useDraftState", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("persiste o valor em sessionStorage sob a chave prefixada", () => {
    const { result } = renderHook(() => useDraftState("tradeName", ""));
    act(() => result.current[1]("Ótica Foco"));
    expect(window.sessionStorage.getItem(PREFIX + "tradeName")).toBe(JSON.stringify("Ótica Foco"));
  });

  it("restaura o valor persistido na montagem (não usa o inicial)", () => {
    window.sessionStorage.setItem(PREFIX + "email", JSON.stringify("a@b.com"));
    const { result } = renderHook(() => useDraftState("email", ""));
    expect(result.current[0]).toBe("a@b.com");
  });

  it("preserva tipos não-string (boolean/number)", () => {
    const { result: bool } = renderHook(() => useDraftState("isNetwork", false));
    act(() => bool.current[1](true));
    const { result: restored } = renderHook(() => useDraftState("isNetwork", false));
    expect(restored.current[0]).toBe(true);

    const { result: num } = renderHook(() => useDraftState("trialDays", 14));
    act(() => num.current[1](30));
    expect(JSON.parse(window.sessionStorage.getItem(PREFIX + "trialDays")!)).toBe(30);
  });

  it("cai no fallback quando o JSON salvo está corrompido", () => {
    window.sessionStorage.setItem(PREFIX + "cnpj", "{não-json}");
    const { result } = renderHook(() => useDraftState("cnpj", "vazio"));
    expect(result.current[0]).toBe("vazio");
  });

  it("useClearDraft remove todas as chaves informadas", () => {
    window.sessionStorage.setItem(PREFIX + "tradeName", JSON.stringify("X"));
    window.sessionStorage.setItem(PREFIX + "email", JSON.stringify("y@z.com"));
    // chave fora da lista não deve ser tocada
    window.sessionStorage.setItem("outra-coisa", "preservar");

    const { result } = renderHook(() => useClearDraft(["tradeName", "email"]));
    act(() => result.current());

    expect(window.sessionStorage.getItem(PREFIX + "tradeName")).toBeNull();
    expect(window.sessionStorage.getItem(PREFIX + "email")).toBeNull();
    expect(window.sessionStorage.getItem("outra-coisa")).toBe("preservar");
  });
});
