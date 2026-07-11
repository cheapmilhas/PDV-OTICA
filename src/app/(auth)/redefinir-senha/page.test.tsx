/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RedefinirSenhaPage from "./page";

function setUrl(search: string) {
  window.history.replaceState(null, "", `/redefinir-senha${search}`);
}

describe("RedefinirSenhaPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setUrl("");
  });

  describe("com token na URL", () => {
    beforeEach(() => {
      setUrl("?t=abc.def");
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      }) as unknown as typeof fetch;
    });

    it("limpa o token da URL no mount (replaceState)", () => {
      render(<RedefinirSenhaPage />);
      expect(window.location.search).toBe("");
      expect(window.location.pathname).toBe("/redefinir-senha");
    });

    it("renderiza os 2 campos de senha", () => {
      render(<RedefinirSenhaPage />);
      expect(screen.getByLabelText("Nova senha")).toBeTruthy();
      expect(screen.getByLabelText("Confirmar nova senha")).toBeTruthy();
    });

    it("senhas divergentes: erro 'não coincidem' e fetch NÃO chamado", async () => {
      render(<RedefinirSenhaPage />);
      fireEvent.change(screen.getByLabelText("Nova senha"), {
        target: { value: "senhaForte123" },
      });
      fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
        target: { value: "outraCoisa456" },
      });
      fireEvent.click(screen.getByRole("button", { name: /salvar|redefinir|alterar/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toMatch(/não coincidem/i);
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("senha curta: erro de tamanho mínimo e fetch NÃO chamado", async () => {
      render(<RedefinirSenhaPage />);
      fireEvent.change(screen.getByLabelText("Nova senha"), {
        target: { value: "curta1" },
      });
      fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
        target: { value: "curta1" },
      });
      fireEvent.click(screen.getByRole("button", { name: /salvar|redefinir|alterar/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toMatch(/8 caracteres/i);
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("senhas iguais e válidas + fetch ok: estado de sucesso", async () => {
      render(<RedefinirSenhaPage />);
      fireEvent.change(screen.getByLabelText("Nova senha"), {
        target: { value: "SenhaForte123!" },
      });
      fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
        target: { value: "SenhaForte123!" },
      });
      fireEvent.click(screen.getByRole("button", { name: /salvar|redefinir|alterar/i }));

      await waitFor(() => {
        expect(screen.getByText(/Senha alterada com sucesso/i)).toBeTruthy();
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("/api/auth/redefinir-senha");
      expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
        token: "abc.def",
        password: "SenhaForte123!",
      });
    });

    it("fetch não-ok: mostra o erro do servidor inline", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Link inválido ou expirado" }),
      }) as unknown as typeof fetch;
      render(<RedefinirSenhaPage />);
      fireEvent.change(screen.getByLabelText("Nova senha"), {
        target: { value: "SenhaForte123!" },
      });
      fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
        target: { value: "SenhaForte123!" },
      });
      fireEvent.click(screen.getByRole("button", { name: /salvar|redefinir|alterar/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toMatch(
          /Link inválido ou expirado/i
        );
      });
    });

    it("medidor de força: senha forte mostra rótulo 'forte'", () => {
      render(<RedefinirSenhaPage />);
      fireEvent.change(screen.getByLabelText("Nova senha"), {
        target: { value: "SenhaForte123!@#" },
      });
      expect(screen.getByText("Senha forte")).toBeTruthy();
    });
  });

  describe("sem token na URL", () => {
    beforeEach(() => {
      setUrl("");
    });

    it("mostra o estado 'Link inválido ou expirado'", () => {
      render(<RedefinirSenhaPage />);
      expect(screen.getByText(/Link inválido ou expirado/i)).toBeTruthy();
      expect(screen.queryByLabelText("Nova senha")).toBeNull();
    });
  });
});
