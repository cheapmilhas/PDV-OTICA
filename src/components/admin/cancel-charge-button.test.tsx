/** @vitest-environment jsdom */
/**
 * 🚨 `fetch` é sempre mockado. Nenhum teste daqui pode disparar a rota real —
 * ela chama `DELETE /payments/{id}` no Asaas de PRODUÇÃO, sem sandbox e sem
 * volta. O teste que verifica a URL assere sobre o mock, nunca sobre a rede.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => ({ toast }));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CancelChargeButton, isConfirmed, CONFIRM_WORD } from "./cancel-charge-button";

const PROPS = {
  invoiceId: "inv_1",
  invoiceNumber: "INV-000004",
  totalCents: 14990,
  asaasPaymentId: "pay_7q8qptpcuqwj21yd",
};

function openDialog() {
  render(<CancelChargeButton {...PROPS} />);
  fireEvent.click(screen.getByText("Cancelar cobrança"));
}

function confirmButton(): HTMLButtonElement {
  // Dois elementos têm o texto: o gatilho e o botão do diálogo. O do diálogo é
  // o último renderizado.
  const all = screen.getAllByText("Cancelar cobrança");
  return all[all.length - 1].closest("button") as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ success: true, outcome: "canceled", gateway: "deleted" }), {
      status: 200,
    }),
  );
});

/**
 * 🔥 A regra de armar, testada DIRETO.
 *
 * Existe porque a mutação "remover o `!armed` do handler" SOBREVIVEU a todos os
 * testes de clique: o React reaplica o `disabled` antes de o evento chegar, o
 * jsdom não entrega o clique, e o teste passa por causa do HTML — não do código.
 * Cobertura por acidente não é cobertura. Aqui a regra é exercitada como o que
 * ela é: uma função.
 */
describe("isConfirmed — a palavra que arma", () => {
  it("a palavra exata arma", () => {
    expect(isConfirmed("CANCELAR")).toBe(true);
    expect(CONFIRM_WORD).toBe("CANCELAR");
  });

  it("minúsculas e espaços em volta ainda armam", () => {
    expect(isConfirmed("cancelar")).toBe(true);
    expect(isConfirmed("  Cancelar  ")).toBe(true);
  });

  it("🔥 vazio, palavra errada ou parcial NÃO armam", () => {
    for (const v of ["", "   ", "sim", "ok", "CANCEL", "CANCELARR", "CANCELAR agora", "confirmar"]) {
      expect(isConfirmed(v)).toBe(false);
    }
  });
});

describe("confirmação explícita", () => {
  it("primeiro clique só abre o diálogo — NÃO dispara a rota", () => {
    openDialog();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("🔥 o diálogo mostra fatura, valor e o paymentId a ser destruído", () => {
    openDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("INV-000004");
    expect(dialog.textContent).toContain("149,90");
    expect(dialog.textContent).toContain("pay_7q8qptpcuqwj21yd");
    expect(dialog.textContent?.toLowerCase()).toContain("irreversível");
  });

  it("🔥 sem digitar CANCELAR o botão fica DESABILITADO", () => {
    openDialog();
    expect(confirmButton().disabled).toBe(true);
  });

  it("🔥 palavra errada não arma o botão", () => {
    openDialog();
    fireEvent.change(screen.getByLabelText(/digite cancelar/i), { target: { value: "sim" } });
    expect(confirmButton().disabled).toBe(true);
    fireEvent.click(confirmButton());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("digitar CANCELAR arma o botão e o clique chama a rota certa", async () => {
    openDialog();
    fireEvent.change(screen.getByLabelText(/digite cancelar/i), { target: { value: "CANCELAR" } });
    expect(confirmButton().disabled).toBe(false);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect((global.fetch as any).mock.calls[0][0]).toBe("/api/admin/invoices/inv_1/cancel-charge");
    expect((global.fetch as any).mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("aceita minúsculas/espaços na confirmação (só a palavra importa)", async () => {
    openDialog();
    fireEvent.change(screen.getByLabelText(/digite cancelar/i), { target: { value: " cancelar " } });
    expect(confirmButton().disabled).toBe(false);
  });

  it("'Voltar' fecha sem chamar nada e limpa o campo", () => {
    openDialog();
    fireEvent.change(screen.getByLabelText(/digite cancelar/i), { target: { value: "CANCELAR" } });
    fireEvent.click(screen.getByText("Voltar"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("respostas do servidor", () => {
  async function confirmar() {
    openDialog();
    fireEvent.change(screen.getByLabelText(/digite cancelar/i), { target: { value: "CANCELAR" } });
    fireEvent.click(confirmButton());
  }

  it("sucesso normal → 'Cobrança cancelada no Asaas.'", async () => {
    await confirmar();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Cobrança cancelada no Asaas."),
    );
  });

  it("already_gone → diz que a cobrança já não existia", async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ success: true, outcome: "canceled", gateway: "already_gone" }), {
        status: 200,
      }),
    );
    await confirmar();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/já não existia/i)),
    );
  });

  it("already_canceled → mensagem idempotente", async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, outcome: "already_canceled", gateway: "skipped" }),
        { status: 200 },
      ),
    );
    await confirmar();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/já estava cancelada/i)),
    );
  });

  it("🔥 409 (fatura paga) → toast de ERRO com a mensagem do servidor, e o diálogo NÃO some", async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ error: "Fatura PAGA — o caminho é ESTORNO", reason: "paid" }), {
        status: 409,
      }),
    );
    await confirmar();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/estorno/i)),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("🔥 502 (gateway) → erro, nunca sucesso", async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ error: "O Asaas recusou. Nada foi alterado." }), { status: 502 }),
    );
    await confirmar();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("fetch lança (rede caiu) → toast de erro", async () => {
    (global.fetch as any).mockRejectedValue(new Error("network"));
    await confirmar();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
