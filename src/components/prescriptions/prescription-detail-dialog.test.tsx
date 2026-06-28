/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrescriptionDetailDialog } from "./prescription-detail-dialog";

const rx = {
  id: "rx-1",
  issuedAt: "2026-06-01T00:00:00.000Z",
  expiresAt: "2027-06-01T00:00:00.000Z",
  status: "COMPLETA" as const,
  isDependente: false,
  patientName: null,
  saleId: "sale-1",
  serviceOrderId: null,
  hasServiceOrder: false,
  customer: { id: "c1", name: "Lucas Conrado" },
  values: {
    odSph: "-1.75", odCyl: "-0.75", odAxis: 90,
    oeSph: "-2.00", oeCyl: null, oeAxis: null,
    pdFar: "33", fittingHeightOd: "20", odAdd: "1.50",
  },
};

describe("PrescriptionDetailDialog", () => {
  it("exibe o paciente e os valores de grau OD/OE em leitura", () => {
    render(<PrescriptionDetailDialog prescription={rx} open onClose={() => {}} />);
    expect(screen.getByText("Lucas Conrado")).toBeTruthy();
    // os valores do grau aparecem (esférico OD/OE)
    expect(screen.getByText(/-1[.,]75/)).toBeTruthy();
    expect(screen.getByText(/-2[.,]00/)).toBeTruthy();
  });

  it("mostra botão Editar quando canEdit e dispara onEdit", () => {
    const onEdit = vi.fn();
    render(
      <PrescriptionDetailDialog prescription={rx} open onClose={() => {}} canEdit onEdit={onEdit} />
    );
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(onEdit).toHaveBeenCalledWith("rx-1");
  });

  it("sem canEdit não mostra botão Editar", () => {
    render(<PrescriptionDetailDialog prescription={rx} open onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /editar/i })).toBeNull();
  });

  it("receita VINCULADA A UMA OS é só-leitura: NÃO mostra Editar mesmo com canEdit", () => {
    const rxComOS = { ...rx, hasServiceOrder: true };
    render(
      <PrescriptionDetailDialog prescription={rxComOS} open onClose={() => {}} canEdit onEdit={() => {}} />
    );
    expect(screen.queryByRole("button", { name: /editar/i })).toBeNull();
    expect(screen.getByText(/edite o grau na Ordem de Serviço/i)).toBeTruthy();
  });

  it("receita SEM OS (exame avulso) com canEdit MOSTRA Editar", () => {
    const rxSemOS = { ...rx, hasServiceOrder: false };
    render(
      <PrescriptionDetailDialog prescription={rxSemOS} open onClose={() => {}} canEdit onEdit={() => {}} />
    );
    expect(screen.getByRole("button", { name: /editar/i })).toBeTruthy();
  });

  it("origem mostra 'OS' quando a receita tem OS apontando (mesmo com saleId)", () => {
    const rxComOS = { ...rx, saleId: "sale-1", hasServiceOrder: true };
    render(<PrescriptionDetailDialog prescription={rxComOS} open onClose={() => {}} />);
    expect(screen.getByText(/Origem: OS/)).toBeTruthy();
  });

  it("origem mostra 'Venda' quando tem venda e NÃO tem OS", () => {
    const rxVenda = { ...rx, saleId: "sale-1", hasServiceOrder: false };
    render(<PrescriptionDetailDialog prescription={rxVenda} open onClose={() => {}} />);
    expect(screen.getByText(/Origem: Venda/)).toBeTruthy();
  });

  it("nome do cliente no detalhe é link para a ficha (nova aba)", () => {
    render(<PrescriptionDetailDialog prescription={rx} open onClose={() => {}} />);
    const link = screen.getByRole("link", { name: /Lucas Conrado/i });
    expect(link.getAttribute("href")).toBe("/dashboard/clientes/c1");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
