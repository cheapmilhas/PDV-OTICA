/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EsqueciSenhaPage from "./page";

describe("EsqueciSenhaPage", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza o campo de e-mail e o botão 'Enviar link'", () => {
    render(<EsqueciSenhaPage />);
    expect(screen.getByLabelText("Seu e-mail")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar link" })).toBeTruthy();
  });

  it("após submit mostra o estado de sucesso genérico", async () => {
    render(<EsqueciSenhaPage />);
    const email = screen.getByLabelText("Seu e-mail") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "cliente@exemplo.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Se houver uma conta com esse e-mail/i)
      ).toBeTruthy();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/auth/esqueci-senha");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      email: "cliente@exemplo.com",
    });
  });

  it("mostra o estado de sucesso mesmo se o fetch rejeitar (endpoint genérico)", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    render(<EsqueciSenhaPage />);
    fireEvent.change(screen.getByLabelText("Seu e-mail"), {
      target: { value: "x@y.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));
    await waitFor(() => {
      expect(
        screen.getByText(/Se houver uma conta com esse e-mail/i)
      ).toBeTruthy();
    });
  });
});
