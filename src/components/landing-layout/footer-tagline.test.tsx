/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * O rodapé é compartilhado por TODAS as páginas, inclusive a /medical.
 * Assinar "Feito para óticas brasileiras" embaixo de uma landing que vende
 * prontuário eletrônico dizia ao médico que ele estava no lugar errado.
 */

const usePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

import { FooterBrandLine, FooterMadeFor, FooterOtherProduct } from "./footer-tagline";

describe("rodapé consciente de rota", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assina ÓTICA na home", () => {
    usePathname.mockReturnValue("/");
    render(<FooterMadeFor />);
    expect(screen.getByText(/óticas brasileiras/i)).toBeDefined();
  });

  it("assina CLÍNICA na /medical", () => {
    usePathname.mockReturnValue("/medical");
    render(<FooterMadeFor />);
    expect(screen.getByText(/clínicas brasileiras/i)).toBeDefined();
  });

  it("assina CLÍNICA em subrota de /medical", () => {
    usePathname.mockReturnValue("/medical/algo");
    render(<FooterMadeFor />);
    expect(screen.getByText(/clínicas brasileiras/i)).toBeDefined();
  });

  // Guarda contra falso-positivo por prefixo: uma rota que apenas COMEÇA com
  // "medical" (ex.: /medical-algo) não é o produto Medical.
  it("NÃO confunde rota que só começa com 'medical'", () => {
    usePathname.mockReturnValue("/medical-outra-coisa");
    render(<FooterMadeFor />);
    expect(screen.getByText(/óticas brasileiras/i)).toBeDefined();
  });

  it("a linha de marca também muda por produto", () => {
    usePathname.mockReturnValue("/medical");
    const { unmount } = render(<FooterBrandLine />);
    expect(screen.getByText(/sua clínica/i)).toBeDefined();
    unmount();

    usePathname.mockReturnValue("/precos");
    render(<FooterBrandLine />);
    expect(screen.getByText(/sua ótica/i)).toBeDefined();
  });

  // pathname null acontece em render fora de contexto de rota.
  it("cai no texto ótico quando não há rota", () => {
    usePathname.mockReturnValue(null);
    render(<FooterMadeFor />);
    expect(screen.getByText(/óticas brasileiras/i)).toBeDefined();
  });
});

describe('rodapé — bloco "Outro produto"', () => {
  beforeEach(() => vi.clearAllMocks());

  it("nas páginas óticas, aponta para o Vis Medical", () => {
    usePathname.mockReturnValue("/");
    render(<FooterOtherProduct />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/medical");
    expect(link.textContent).toMatch(/clínicas/i);
  });

  // O defeito que motivou o componente: com o item fixo em "Vis Medical", o
  // rodapé DENTRO da /medical oferecia a página em que o visitante já estava —
  // e o Vis para óticas, o outro produto de verdade ali, não aparecia.
  // Aponta para /oticas, não para "/": com a home institucional, a raiz deixou
  // de ser o produto ótico.
  it("NÃO faz self-link dentro da /medical: aponta para a landing de óticas", () => {
    usePathname.mockReturnValue("/medical");
    render(<FooterOtherProduct />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/oticas");
    expect(link.getAttribute("href")).not.toBe("/medical");
    expect(link.textContent).toMatch(/óticas/i);
  });
});
