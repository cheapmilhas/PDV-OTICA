/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductCombobox } from "./product-combobox";

// Mesma classe do bug do orçamento (rotina 21/06): selecionar um resultado
// não podia falhar pela corrida onBlur×clique.

function mockSearch(products: unknown[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: products }),
  }) as unknown as typeof fetch;
}

const PRODUTO = { id: "p1", name: "ARM. ANA HICKMANN", sku: "005" };

describe("ProductCombobox (campanhas) — seleção robusta", () => {
  afterEach(() => vi.restoreAllMocks());

  it("CRÍTICO: selecionar resultado (mouseDown após blur) chama onSelect", async () => {
    mockSearch([PRODUTO]);
    const onSelect = vi.fn();
    render(<ProductCombobox onSelect={onSelect} />);

    fireEvent.change(screen.getByPlaceholderText(/Digite o nome/i), {
      target: { value: "ana" },
    });

    const item = await screen.findByText("ARM. ANA HICKMANN");

    // blur agenda fechar o dropdown; mouseDown deve selecionar antes disso.
    fireEvent.blur(screen.getByPlaceholderText(/Digite o nome/i));
    fireEvent.mouseDown(item);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  it("limpa a busca após selecionar", async () => {
    mockSearch([PRODUTO]);
    render(<ProductCombobox onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Digite o nome/i), {
      target: { value: "ana" },
    });
    const item = await screen.findByText("ARM. ANA HICKMANN");
    fireEvent.mouseDown(item);
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText(/Digite o nome/i) as HTMLInputElement).value
      ).toBe("")
    );
  });
});
