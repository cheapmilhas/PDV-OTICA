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
    const { container } = render(<AdminSidebar activeProduct="VIS_APP" />);
    // O <aside> fixo do desktop existe.
    expect(container.querySelector("aside")).toBeDefined();
    // Conteúdo da marca presente.
    expect(screen.getByText("PDV Ótica")).toBeDefined();
    expect(screen.getByText("Portal de administração")).toBeDefined();
  });

  it("renderiza o botão hambúrguer do mobile", () => {
    render(<AdminMobileMenu activeProduct="VIS_APP" />);
    expect(screen.getByRole("button", { name: "Abrir menu" })).toBeDefined();
  });

  it("o seletor nasce marcando o produto do cookie, não hardcode Vis App", () => {
    // Regressão: o estado inicial era hardcoded "VIS_APP", então no reload o
    // botão voltava a Vis App mesmo com o cookie em Vis Medical → lista vazia.
    render(<AdminSidebar activeProduct="VIS_MEDICAL" />);
    const medical = screen.getByRole("button", { name: /vis medical/i });
    expect(medical.getAttribute("aria-pressed")).toBe("true");
  });
});
