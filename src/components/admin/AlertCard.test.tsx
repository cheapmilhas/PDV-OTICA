/** @vitest-environment jsdom */
// src/components/admin/AlertCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";

import { AlertCard } from "./AlertCard";

describe("AlertCard", () => {
  it("renderiza título e descrição", () => {
    render(<AlertCard icon={Activity} title="3 clientes em risco" description="Precisa atenção" />);
    expect(screen.getByText("3 clientes em risco")).toBeDefined();
    expect(screen.getByText("Precisa atenção")).toBeDefined();
  });

  it("vira um link navegável quando href é passado", () => {
    render(<AlertCard icon={Activity} title="Cobrar agora" href="/admin/financeiro/inadimplencia" />);
    const link = screen.getByRole("link", { name: /Cobrar agora/ });
    expect(link.getAttribute("href")).toBe("/admin/financeiro/inadimplencia");
  });

  it("renderiza como div (não-link) sem href", () => {
    const { container } = render(<AlertCard icon={Activity} title="Sem ação" />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("aplica classes de tom via token (danger usa destructive)", () => {
    const { container } = render(<AlertCard icon={Activity} title="X" tone="danger" />);
    expect(container.firstChild).toHaveProperty("className");
    expect((container.firstChild as HTMLElement).className).toContain("destructive");
  });
});
