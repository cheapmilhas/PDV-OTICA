/** @vitest-environment jsdom */
// src/components/admin/KPICard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Building2 } from "lucide-react";
import { KPICard } from "./KPICard";

describe("KPICard", () => {
  it("renderiza label, valor e ícone", () => {
    render(<KPICard icon={Building2} label="Total de Empresas" value="12" />);
    expect(screen.getByText("Total de Empresas")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
  });

  it("renderiza tendência positiva e negativa", () => {
    const { rerender } = render(<KPICard icon={Building2} label="MRR" value="R$ 274" trend={{ direction: "up", label: "+5%" }} />);
    expect(screen.getByText("+5%")).toBeDefined();
    rerender(<KPICard icon={Building2} label="MRR" value="R$ 274" trend={{ direction: "down", label: "-100%" }} />);
    expect(screen.getByText("-100%")).toBeDefined();
  });
});
