/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrescriptionGradeForm } from "./prescription-grade-form";

const emptyValue = { od: {}, oe: {}, adicao: "" };

describe("PrescriptionGradeForm", () => {
  it("renderiza a grade OD/OE com as colunas do grau", () => {
    render(<PrescriptionGradeForm value={emptyValue} onChange={() => {}} />);
    expect(screen.getByText("OD")).toBeTruthy();
    expect(screen.getByText("OE")).toBeTruthy();
    expect(screen.getByText("Esférico")).toBeTruthy();
    expect(screen.getByText("Cilíndrico")).toBeTruthy();
    expect(screen.getByText("Eixo")).toBeTruthy();
  });

  it("emite onChange com {od,oe,adicao} ao digitar (preserva vírgula)", () => {
    const onChange = vi.fn();
    render(<PrescriptionGradeForm value={emptyValue} onChange={onChange} />);
    const esfOd = screen.getByTestId("grade-od-esf");
    fireEvent.change(esfOd, { target: { value: "-1,75" } });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls.at(-1)![0];
    expect(arg.od.esf).toBe("-1,75");
    expect(arg).toHaveProperty("oe");
    expect(arg).toHaveProperty("adicao");
  });

  it("desabilita inputs quando disabled", () => {
    render(<PrescriptionGradeForm value={emptyValue} onChange={() => {}} disabled />);
    expect((screen.getByTestId("grade-od-esf") as HTMLInputElement).disabled).toBe(true);
  });
});
