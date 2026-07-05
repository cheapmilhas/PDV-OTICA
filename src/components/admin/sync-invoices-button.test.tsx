/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));
import { SyncInvoicesButton } from "./sync-invoices-button";

it("mostra resumo após sincronizar", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, invoicesCreated: 3, invoiceCreatedEmails: 3, dueSoonEmails: 0 }), { status: 200 }));
  render(<SyncInvoicesButton />);
  fireEvent.click(screen.getByText("Sincronizar cobranças agora"));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Processado: 3 faturas/)));
});

it("avisa quando geração está desligada", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ skipped: "generation_disabled" }), { status: 200 }));
  render(<SyncInvoicesButton />);
  fireEvent.click(screen.getByText("Sincronizar cobranças agora"));
  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/ligue a flag de geração/i)));
});

it("desabilita o botão e mostra 'Sincronizando…' durante o fetch", async () => {
  let resolveFetch!: (v: Response) => void;
  vi.spyOn(global, "fetch").mockReturnValue(
    new Promise<Response>((r) => { resolveFetch = r; }) as Promise<Response>
  );
  render(<SyncInvoicesButton />);
  fireEvent.click(screen.getByText("Sincronizar cobranças agora"));
  // in-flight: label trocou e botão desabilitado
  const button = screen.getByRole("button") as HTMLButtonElement;
  expect(button.textContent).toContain("Sincronizando");
  expect(button.disabled).toBe(true);
  // resolve para não vazar a promise
  resolveFetch(new Response(JSON.stringify({ success: true, invoicesCreated: 0, invoiceCreatedEmails: 0, dueSoonEmails: 0 }), { status: 200 }));
  await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
});
