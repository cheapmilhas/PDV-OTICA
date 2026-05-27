/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockReplace = vi.fn();
let mockParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/dashboard",
}));

import { UpgradeRequiredBanner } from "@/components/plan/upgrade-required-banner";

describe("UpgradeRequiredBanner", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockParams = new URLSearchParams();
  });

  it("não renderiza nada quando não há ?upgrade-required", () => {
    const { container } = render(<UpgradeRequiredBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza com label do FEATURE_REGISTRY quando ?upgrade-required=dre_report", () => {
    mockParams = new URLSearchParams("upgrade-required=dre_report");
    render(<UpgradeRequiredBanner />);
    expect(screen.getByText(/DRE Dinâmico/)).toBeDefined();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("renderiza com o próprio valor quando feature não está no registry", () => {
    mockParams = new URLSearchParams("upgrade-required=feature_inexistente");
    render(<UpgradeRequiredBanner />);
    expect(screen.getByText(/feature_inexistente/)).toBeDefined();
  });

  it("link de upgrade aponta para WhatsApp de suporte", () => {
    mockParams = new URLSearchParams("upgrade-required=cash_flow");
    render(<UpgradeRequiredBanner />);
    const link = screen.getByText("Fazer upgrade") as HTMLAnchorElement;
    expect(link.href).toContain("wa.me");
  });

  it("botão fechar chama router.replace removendo o param", () => {
    mockParams = new URLSearchParams("upgrade-required=cash_flow&outro=mantido");
    render(<UpgradeRequiredBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(mockReplace).toHaveBeenCalledWith("/dashboard?outro=mantido");
  });
});
