/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DecimalInput } from "./decimal-input";

describe("DecimalInput", () => {
  it("renderiza type=text + inputMode=decimal (nunca type=number)", () => {
    render(<DecimalInput value="" onValueChange={() => {}} data-testid="di" />);
    const el = screen.getByTestId("di") as HTMLInputElement;
    expect(el.getAttribute("type")).toBe("text");
    expect(el.getAttribute("inputmode")).toBe("decimal");
  });

  it("mantém a vírgula decimal pt-BR (não descarta como type=number)", () => {
    const onValueChange = vi.fn();
    render(<DecimalInput value="" onValueChange={onValueChange} data-testid="di" />);
    fireEvent.change(screen.getByTestId("di"), { target: { value: "12,50" } });
    expect(onValueChange).toHaveBeenLastCalledWith("12,50");
  });

  it("sanitiza caracteres inválidos, preserva dígitos/vírgula/ponto/sinal", () => {
    const onValueChange = vi.fn();
    render(<DecimalInput value="" onValueChange={onValueChange} data-testid="di" />);
    fireEvent.change(screen.getByTestId("di"), { target: { value: "R$ 1.234,56abc" } });
    expect(onValueChange).toHaveBeenLastCalledWith("1.234,56");
  });

  it("reflete o value controlado", () => {
    render(<DecimalInput value="99,90" onValueChange={() => {}} data-testid="di" />);
    expect((screen.getByTestId("di") as HTMLInputElement).value).toBe("99,90");
  });

  it("money: mostra prefixo R$", () => {
    render(<DecimalInput value="" onValueChange={() => {}} money data-testid="di" />);
    expect(screen.getByText(/R\$/)).toBeInTheDocument();
  });
});
