/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrescriptionList, type PrescriptionListItem } from "./prescription-list";

const base: PrescriptionListItem = {
  id: "rx-1",
  issuedAt: "2026-06-01T00:00:00.000Z",
  expiresAt: "2027-06-01T00:00:00.000Z",
  status: "COMPLETA",
  isDependente: false,
  patientName: null,
  saleId: "sale-1",
  serviceOrderId: null,
  customer: { id: "c1", name: "Maria Silva" },
  values: { odSph: "-1.75", oeSph: "-2.00" },
};

describe("PrescriptionList", () => {
  it("renderiza o paciente titular (nome do cliente)", () => {
    render(<PrescriptionList prescriptions={[base]} />);
    expect(screen.getByText("Maria Silva")).toBeTruthy();
  });

  it("marca dependente com badge + patientName", () => {
    render(
      <PrescriptionList
        prescriptions={[{ ...base, isDependente: true, patientName: "Filho da Maria" }]}
      />
    );
    expect(screen.getByText("Filho da Maria")).toBeTruthy();
    expect(screen.getByText(/Dependente/i)).toBeTruthy();
  });

  it("mostra 'Digitar grau' para receita AGUARDANDO_GRAU", () => {
    const onDigitar = vi.fn();
    render(
      <PrescriptionList
        prescriptions={[{ ...base, status: "AGUARDANDO_GRAU", values: null }]}
        onDigitarGrau={onDigitar}
      />
    );
    expect(screen.getByText(/Digitar grau/i)).toBeTruthy();
  });

  it("estado vazio quando não há receitas", () => {
    render(<PrescriptionList prescriptions={[]} />);
    expect(screen.getByText(/Nenhuma receita/i)).toBeTruthy();
  });

  it("clicar no card chama onVer com a receita inteira", () => {
    const onVer = vi.fn();
    render(<PrescriptionList prescriptions={[base]} onVer={onVer} />);
    fireEvent.click(screen.getByText("Maria Silva"));
    expect(onVer).toHaveBeenCalledWith(expect.objectContaining({ id: "rx-1" }));
  });

  it("clicar em 'Digitar grau' NÃO dispara onVer (stopPropagation)", () => {
    const onVer = vi.fn();
    const onDigitar = vi.fn();
    render(
      <PrescriptionList
        prescriptions={[{ ...base, status: "AGUARDANDO_GRAU", values: null }]}
        onVer={onVer}
        onDigitarGrau={onDigitar}
      />
    );
    fireEvent.click(screen.getByText(/Digitar grau/i));
    expect(onDigitar).toHaveBeenCalled();
    expect(onVer).not.toHaveBeenCalled();
  });
});
