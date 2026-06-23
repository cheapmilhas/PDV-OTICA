/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModalPagarConta } from "./modal-pagar-conta";

// Bug rotina 21/06: "não existe caixa negativo". Pagar em DINHEIRO (conta CASH)
// sem saldo deve BLOQUEAR (não só avisar). Conta de banco pode ficar negativa.

function mockAccounts(accounts: unknown[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: accounts }),
  }) as unknown as typeof fetch;
}

const CONTA_AGUA = { id: "ap_1", description: "água loja", amount: 15 };

describe("ModalPagarConta — trava de caixa negativo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("(a) caixa CASH sem saldo: bloqueia o pagamento (botão desabilitado + erro)", async () => {
    mockAccounts([{ id: "fa_caixa", name: "Caixa", type: "CASH", balance: 0 }]);
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ModalPagarConta
        open
        onOpenChange={vi.fn()}
        account={CONTA_AGUA}
        onConfirm={onConfirm}
      />
    );

    // Conta única é pré-selecionada automaticamente.
    await waitFor(() =>
      expect(screen.getByText(/não pode ficar negativo/i)).toBeDefined()
    );

    const btn = screen.getByRole("button", { name: /Confirmar Pagamento/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("(b) conta de BANCO sem saldo: só avisa, NÃO bloqueia", async () => {
    mockAccounts([{ id: "fa_banco", name: "Banco", type: "BANK", balance: 0 }]);
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ModalPagarConta
        open
        onOpenChange={vi.fn()}
        account={CONTA_AGUA}
        onConfirm={onConfirm}
      />
    );

    await waitFor(() =>
      expect(screen.getByText(/saldo ficará negativo/i)).toBeDefined()
    );

    const btn = screen.getByRole("button", { name: /Confirmar Pagamento/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(btn);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("fa_banco"));
  });

  it("(c) caixa CASH com saldo suficiente: permite pagar", async () => {
    mockAccounts([{ id: "fa_caixa", name: "Caixa", type: "CASH", balance: 500 }]);
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ModalPagarConta
        open
        onOpenChange={vi.fn()}
        account={CONTA_AGUA}
        onConfirm={onConfirm}
      />
    );

    const btn = await screen.findByRole("button", { name: /Confirmar Pagamento/i });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/não pode ficar negativo/i)).toBeNull();

    fireEvent.click(btn);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("fa_caixa"));
  });
});
