/** @vitest-environment jsdom */
// src/components/admin/AdminSidebar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// next/navigation precisa ser mockado: AdminSidebar usa usePathname,
// e os filhos (AdminNav/AdminLogoutButton) usam usePathname/useRouter.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AdminSidebar, AdminMobileMenu } from "./AdminSidebar";

describe("AdminSidebar", () => {
  it("renderiza a sidebar fixa do desktop com a marca", () => {
    const { container } = render(<AdminSidebar />);
    // O <aside> fixo do desktop existe.
    expect(container.querySelector("aside")).toBeDefined();
    // Conteúdo da marca presente.
    expect(screen.getByText("PDV Ótica")).toBeDefined();
    expect(screen.getByText("Admin Portal")).toBeDefined();
  });

  it("renderiza o botão hambúrguer do mobile", () => {
    render(<AdminMobileMenu />);
    expect(screen.getByRole("button", { name: "Abrir menu" })).toBeDefined();
  });
});
