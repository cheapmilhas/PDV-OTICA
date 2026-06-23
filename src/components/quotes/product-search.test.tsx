/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductSearch } from "./product-search";

// Mock do toast para não poluir o ambiente de teste.
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const PRODUTO = {
  id: "prod_1",
  sku: "005",
  name: "ARM. PARAFUSADA FEMI. AD (ANA HICKMANN)",
  salePrice: 200,
  stockQty: 0,
};

function mockFetchOnce(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data }),
  });
}

describe("ProductSearch — inserção ao selecionar (bug rotina 21/06)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) busca produtos quando o termo tem 2+ caracteres", async () => {
    global.fetch = mockFetchOnce([PRODUTO]) as unknown as typeof fetch;
    render(<ProductSearch onSelectProduct={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/i), {
      target: { value: "ana" },
    });

    await waitFor(() =>
      expect(screen.getByText(PRODUTO.name)).toBeDefined()
    );
  });

  it("(b) CRÍTICO: selecionar um resultado chama onSelectProduct com o produto", async () => {
    global.fetch = mockFetchOnce([PRODUTO]) as unknown as typeof fetch;
    const onSelectProduct = vi.fn();
    render(<ProductSearch onSelectProduct={onSelectProduct} />);

    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/i), {
      target: { value: "ana" },
    });

    const resultado = await screen.findByText(PRODUTO.name);

    // Simula o ciclo real: o blur do input agenda esconder o dropdown,
    // mas o mouseDown deve disparar a seleção ANTES disso.
    fireEvent.blur(screen.getByPlaceholderText(/Buscar produto/i));
    fireEvent.mouseDown(resultado);

    expect(onSelectProduct).toHaveBeenCalledTimes(1);
    expect(onSelectProduct).toHaveBeenCalledWith(
      expect.objectContaining({ id: "prod_1", salePrice: 200 })
    );
  });

  it("(c) limpa a busca e fecha o dropdown após selecionar", async () => {
    global.fetch = mockFetchOnce([PRODUTO]) as unknown as typeof fetch;
    render(<ProductSearch onSelectProduct={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/i), {
      target: { value: "ana" },
    });
    const resultado = await screen.findByText(PRODUTO.name);
    fireEvent.mouseDown(resultado);

    await waitFor(() =>
      expect(screen.queryByText(PRODUTO.name)).toBeNull()
    );
    expect(
      (screen.getByPlaceholderText(/Buscar produto/i) as HTMLInputElement).value
    ).toBe("");
  });
});
