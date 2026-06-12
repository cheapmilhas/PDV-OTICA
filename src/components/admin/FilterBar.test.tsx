/** @vitest-environment jsdom */
// src/components/admin/FilterBar.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterBar, FilterChip } from "./FilterBar";

describe("FilterBar / FilterChip", () => {
  it("renderiza chips e marca o ativo", () => {
    render(
      <FilterBar>
        <FilterChip href="?s=ACTIVE" active>Ativos</FilterChip>
        <FilterChip href="?s=TRIAL">Trial</FilterChip>
      </FilterBar>
    );
    const ativo = screen.getByRole("link", { name: "Ativos" });
    expect(ativo.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Trial" })).toBeDefined();
  });
});
