/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, render, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { useDraftState, useClearDraft, hasDraft } from "./use-draft-state";

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

  // Hydration-safety: o PRIMEIRO render (o que o SSR também produz) precisa
  // devolver `initial`, não o valor do sessionStorage — senão o HTML do servidor
  // (que não vê o storage) diverge do primeiro render do cliente e o React
  // dispara um hydration mismatch. O valor do rascunho entra só APÓS a montagem.
  it("primeiro render devolve o inicial mesmo com rascunho salvo (hydration-safe)", () => {
    window.sessionStorage.setItem(PREFIX + "tradeName", JSON.stringify("Rascunho"));

    const renders: string[] = [];
    function Probe() {
      const [value] = useDraftState("tradeName", "");
      renders.push(value);
      return null;
    }
    render(<Probe />);

    // O primeiro render captura o estado de hidratação do SSR: deve ser o inicial.
    expect(renders[0]).toBe("");
    // Após a montagem (efeito de hidratação), o valor do rascunho é aplicado.
    expect(renders[renders.length - 1]).toBe("Rascunho");
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

  // Regressão: o efeito de escrita do useDraftState NÃO pode apagar o rascunho
  // do storage no primeiro commit (gravando o `initial` por cima). Se apagasse,
  // um hasDraft() consultado logo após a montagem — como o form faz para decidir
  // mostrar o aviso "rascunho restaurado" — leria vazio e o aviso sumiria.
  it("o rascunho sobrevive à montagem: hasDraft ainda o vê após hidratar", async () => {
    window.sessionStorage.setItem(PREFIX + "tradeName", JSON.stringify("Ótica X"));

    let sawDraft: boolean | null = null;
    function Form() {
      // Mesmo padrão do new-client-form: um campo com useDraftState + um efeito
      // que consulta hasDraft na montagem para decidir o aviso.
      const [tradeName] = useDraftState("tradeName", "");
      const [checked, setChecked] = useState(false);
      useEffect(() => {
        sawDraft = hasDraft(["tradeName"]);
        setChecked(true);
      }, []);
      return <span>{checked ? `${tradeName}` : "..."}</span>;
    }
    const { getByText } = render(<Form />);

    // Após a hidratação, o campo mostra o rascunho...
    await waitFor(() => getByText("Ótica X"));
    // ...e o storage NUNCA foi zerado no meio: hasDraft viu o rascunho.
    expect(sawDraft).toBe(true);
    // E o storage segue com o rascunho, não com "" transitório.
    expect(window.sessionStorage.getItem(PREFIX + "tradeName")).toBe(JSON.stringify("Ótica X"));
  });

  it("hasDraft detecta rascunho salvo em qualquer chave-chave", () => {
    // Sem nada salvo → não há rascunho.
    expect(hasDraft(["tradeName", "email"])).toBe(false);
    // Valor vazio salvo não conta como rascunho.
    window.sessionStorage.setItem(PREFIX + "tradeName", JSON.stringify(""));
    expect(hasDraft(["tradeName", "email"])).toBe(false);
    // Qualquer chave com valor não-vazio conta.
    window.sessionStorage.setItem(PREFIX + "email", JSON.stringify("a@b.com"));
    expect(hasDraft(["tradeName", "email"])).toBe(true);
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
