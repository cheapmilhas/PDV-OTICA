/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrescriptionByCustomer } from "./prescription-by-customer";
import type { PrescriptionListItem } from "./prescription-list";

const mk = (over: Partial<PrescriptionListItem>): PrescriptionListItem => ({
  id: "rx", issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z",
  status: "COMPLETA", customer: { id: "c1", name: "Maria" }, values: null, ...over,
});

describe("PrescriptionByCustomer", () => {
  it("mostra um grupo por cliente, com nome ligando à ficha (nova aba)", () => {
    render(<PrescriptionByCustomer prescriptions={[mk({})]} onVer={() => {}} />);
    const link = screen.getByRole("link", { name: /Maria/i });
    expect(link.getAttribute("href")).toBe("/dashboard/clientes/c1");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("lista as receitas do cliente em ordem cronológica crescente", () => {
    render(
      <PrescriptionByCustomer
        prescriptions={[
          mk({ id: "novo", issuedAt: "2026-06-01T00:00:00.000Z" }),
          mk({ id: "velho", issuedAt: "2025-06-01T00:00:00.000Z" }),
        ]}
        onVer={() => {}}
      />
    );
    const rows = screen.getAllByTestId("rx-row");
    expect(rows[0].textContent).toMatch(/2025/);
    expect(rows[1].textContent).toMatch(/2026/);
  });

  it("clicar numa receita chama onVer com a receita", () => {
    const onVer = vi.fn();
    render(<PrescriptionByCustomer prescriptions={[mk({ id: "x" })]} onVer={onVer} />);
    fireEvent.click(screen.getByTestId("rx-row"));
    expect(onVer).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("estado vazio", () => {
    render(<PrescriptionByCustomer prescriptions={[]} onVer={() => {}} />);
    expect(screen.getByText(/Nenhuma receita/i)).toBeTruthy();
  });
});
