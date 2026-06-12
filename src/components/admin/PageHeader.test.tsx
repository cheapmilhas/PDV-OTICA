/** @vitest-environment jsdom */
// src/components/admin/PageHeader.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renderiza título e subtítulo", () => {
    render(<PageHeader title="Clientes" subtitle="12 empresas" />);
    expect(screen.getByRole("heading", { name: "Clientes" })).toBeDefined();
    expect(screen.getByText("12 empresas")).toBeDefined();
  });

  it("renderiza ações no slot", () => {
    render(<PageHeader title="X" actions={<button>Novo</button>} />);
    expect(screen.getByRole("button", { name: "Novo" })).toBeDefined();
  });
});
