/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * O CTA precisa levar ao produto certo. Antes disto, "Entrar" apontava para
 * /login em TODA página — e o /login do Vis não tem ponte com o Domus, então um
 * médico caía num login incapaz de autenticá-lo (beco sem saída, pior que link
 * errado).
 */

const usePathname = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

// framer-motion: substituído por elementos simples — animação não interessa aqui.
vi.mock("framer-motion", () => ({
  motion: { div: (p: Record<string, unknown>) => <div {...p} /> },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ProductCta } from "./product-cta";

describe("ProductCta — rota declara o segmento", () => {
  beforeEach(() => vi.clearAllMocks());

  it("em /oticas, 'entrar' vai DIRETO para o login ótico", () => {
    usePathname.mockReturnValue("/oticas");
    render(<ProductCta role="entrar" variant="desktop" />);
    const link = screen.getByRole("link", { name: /entrar/i });
    expect(link.getAttribute("href")).toBe("/login");
    // sem menu: não há botão de abrir
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("em /medical, 'entrar' vai DIRETO para o login da clínica, em nova aba", () => {
    usePathname.mockReturnValue("/medical");
    render(<ProductCta role="entrar" variant="desktop" />);
    const link = screen.getByRole("link", { name: /entrar/i });
    expect(link.getAttribute("href")).toContain("/authentication");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("em /oticas, 'cadastrar' vai DIRETO para /registro", () => {
    usePathname.mockReturnValue("/oticas");
    render(<ProductCta role="cadastrar" variant="desktop" />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/registro");
  });

  it("em /medical, 'cadastrar' vai DIRETO para /registro-medical", () => {
    usePathname.mockReturnValue("/medical");
    render(<ProductCta role="cadastrar" variant="desktop" />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/registro-medical");
  });

  // Guarda contra falso-positivo por prefixo.
  it("/medical-outra-coisa NÃO conta como medical", () => {
    usePathname.mockReturnValue("/medical-outra-coisa");
    render(<ProductCta role="cadastrar" variant="desktop" />);
    expect(screen.queryByRole("button")).not.toBeNull();
  });
});

describe("ProductCta — rota NÃO declara o segmento", () => {
  beforeEach(() => vi.clearAllMocks());

  it("na home, desktop abre MENU em vez de navegar", () => {
    usePathname.mockReturnValue("/");
    render(<ProductCta role="entrar" variant="desktop" />);
    const botao = screen.getByRole("button");
    expect(botao.getAttribute("aria-haspopup")).toBe("menu");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
  });

  it("na /precos, o menu oferece os DOIS destinos", () => {
    usePathname.mockReturnValue("/precos");
    render(<ProductCta role="entrar" variant="desktop" />);
    // `{ hidden: true }` é OBRIGATÓRIO: o menu fechado leva `aria-hidden`, e sem
    // isso o Testing Library o exclui da consulta por acessibilidade.
    const hrefs = screen
      .getAllByRole("menuitem", { hidden: true })
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/login");
    expect(hrefs.some((h) => h?.includes("/authentication"))).toBe(true);
  });

  it("no MOBILE não há menu: as 2 opções vêm empilhadas", () => {
    usePathname.mockReturnValue("/");
    render(<ProductCta role="cadastrar" variant="mobile" />);
    // sem botão de abrir — os links já estão na tela
    expect(screen.queryByRole("button")).toBeNull();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/registro");
    expect(hrefs).toContain("/registro-medical");
  });
});

describe("ProductCta — teclado", () => {
  beforeEach(() => vi.clearAllMocks());

  // O estado fechado tem de ser afirmado no MARKUP, não só no CSS: jsdom não
  // aplica Tailwind, e no navegador um `display` sobrescrito deixaria 2 links
  // focáveis atrás de um botão que diz aria-expanded="false".
  it("fechado: menu marcado aria-hidden e itens fora da tabulação", () => {
    usePathname.mockReturnValue("/");
    render(<ProductCta role="entrar" variant="desktop" />);
    expect(screen.getByRole("menu", { hidden: true }).getAttribute("aria-hidden")).toBe("true");
    for (const item of screen.getAllByRole("menuitem", { hidden: true })) {
      expect(item.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("aberto: itens entram na tabulação e o menu deixa de ser aria-hidden", async () => {
    const { fireEvent } = await import("@testing-library/react");
    usePathname.mockReturnValue("/");
    render(<ProductCta role="entrar" variant="desktop" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("menu").getAttribute("aria-hidden")).toBe("false");
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.getAttribute("tabindex")).toBe("0");
    }
  });

  it("Escape fecha e devolve o foco ao botão", async () => {
    const { fireEvent } = await import("@testing-library/react");
    usePathname.mockReturnValue("/");
    render(<ProductCta role="entrar" variant="desktop" />);
    const botao = screen.getByRole("button");
    fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(botao);
  });

  it("seta para baixo no 1º item move o foco para o 2º", async () => {
    const { fireEvent } = await import("@testing-library/react");
    usePathname.mockReturnValue("/");
    render(<ProductCta role="entrar" variant="desktop" />);
    fireEvent.click(screen.getByRole("button"));
    const itens = screen.getAllByRole("menuitem");
    itens[0].focus();
    fireEvent.keyDown(itens[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(itens[1]);
  });
});
