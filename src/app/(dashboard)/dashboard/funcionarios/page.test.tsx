/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Wrappers de permissão viram passthrough para renderizar a página no jsdom
// sem provider de sessão/permissões.
vi.mock("@/components/auth/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/permissions/can", () => ({
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import Page from "./page";

describe("FuncionariosPage — campo e-mail de recuperação", () => {
  beforeEach(() => {
    // A página faz fetch no mount (fetchEmployees). Devolve lista vazia.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], pagination: null }),
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra o input 'E-mail de recuperação' no dialog de criar", async () => {
    render(<Page />);

    // Abre o dialog de criar via o botão do header.
    fireEvent.click(screen.getByRole("button", { name: /Novo Vendedor/i }));

    await waitFor(() =>
      expect(screen.getByText(/E-mail de recuperação/i)).toBeDefined()
    );

    const emailInput = document.querySelector(
      'input[type="email"]'
    ) as HTMLInputElement | null;
    expect(emailInput).not.toBeNull();
  });

  it("inclui recoveryEmail no corpo do POST ao cadastrar", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: /Novo Vendedor/i }));

    await waitFor(() =>
      expect(document.querySelector('input[type="email"]')).not.toBeNull()
    );

    // Nome (obrigatório) — primeiro input de texto do dialog.
    const nameInput = screen
      .getByPlaceholderText("Nome do vendedor") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Fulano" } });

    const emailInput = document.querySelector(
      'input[type="email"]'
    ) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "fulano@gmail.com" } });

    fireEvent.click(screen.getByRole("button", { name: /^Cadastrar$/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => c[1]?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body as string);
      expect(body.recoveryEmail).toBe("fulano@gmail.com");
    });
  });
});
