/** @vitest-environment jsdom */
// src/components/admin/AdminStatusBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminStatusBadge } from "./AdminStatusBadge";

describe("AdminStatusBadge", () => {
  it("renderiza o label do status", () => {
    render(<AdminStatusBadge kind="subscription" status="ACTIVE" />);
    expect(screen.getByText("Ativo")).toBeDefined();
  });

  it("aceita label customizado via children", () => {
    render(<AdminStatusBadge kind="invoice" status="PAID">Quitada</AdminStatusBadge>);
    expect(screen.getByText("Quitada")).toBeDefined();
  });
});
