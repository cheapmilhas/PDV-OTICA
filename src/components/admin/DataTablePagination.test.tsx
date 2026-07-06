/** @vitest-environment jsdom */
// src/components/admin/DataTablePagination.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/clientes",
}));

import { DataTablePagination } from "./DataTablePagination";
import { TableSkeleton } from "./TableSkeleton";

const href = (p: number) => `/admin/clientes?page=${p}`;

describe("DataTablePagination", () => {
  it("mostra a faixa correta de itens (1–20 de 148)", () => {
    render(
      <DataTablePagination page={1} pageSize={20} total={148} hrefForPage={href} />,
    );
    expect(screen.getByText("1–20")).toBeDefined();
    expect(screen.getByText("148")).toBeDefined();
    // 148 itens / 20 por página = 8 páginas.
    expect(screen.getByText("1 / 8")).toBeDefined();
  });

  it("calcula a faixa da última página parcial (141–148)", () => {
    render(
      <DataTablePagination page={8} pageSize={20} total={148} hrefForPage={href} />,
    );
    expect(screen.getByText("141–148")).toBeDefined();
    expect(screen.getByText("8 / 8")).toBeDefined();
  });

  it("desabilita 'Anterior' na primeira página e 'Próxima' na última", () => {
    const { rerender } = render(
      <DataTablePagination page={1} pageSize={20} total={148} hrefForPage={href} />,
    );
    const prev = screen.getByText("Anterior").closest("a");
    expect(prev?.getAttribute("aria-disabled")).toBe("true");

    rerender(
      <DataTablePagination page={8} pageSize={20} total={148} hrefForPage={href} />,
    );
    const next = screen.getByText("Próxima").closest("a");
    expect(next?.getAttribute("aria-disabled")).toBe("true");
  });

  it("trata lista vazia sem quebrar", () => {
    render(
      <DataTablePagination page={1} pageSize={20} total={0} hrefForPage={href} />,
    );
    expect(screen.getByText("Nenhum resultado")).toBeDefined();
    expect(screen.getByText("1 / 1")).toBeDefined();
  });
});

describe("TableSkeleton", () => {
  it("renderiza o número pedido de linhas e colunas", () => {
    const { container } = render(<TableSkeleton rows={3} columns={4} />);
    // 4 colunas no header + 3 linhas × 4 colunas = 4 + 12 = 16 barras animadas.
    const bars = container.querySelectorAll(".animate-pulse");
    expect(bars.length).toBe(16);
  });
});
