/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { SyncInvoicesButton } from "./sync-invoices-button";

it("mostra resumo após sincronizar", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, invoicesCreated: 3, invoiceCreatedEmails: 3, dueSoonEmails: 0 }), { status: 200 }));
  render(<SyncInvoicesButton />);
  fireEvent.click(screen.getByText("Sincronizar cobranças agora"));
  await waitFor(() => expect(screen.getByText(/Processado: 3 faturas/)).toBeDefined());
});

it("avisa quando geração está desligada", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ skipped: "generation_disabled" }), { status: 200 }));
  render(<SyncInvoicesButton />);
  fireEvent.click(screen.getByText("Sincronizar cobranças agora"));
  await waitFor(() => expect(screen.getByText(/ligue a flag de geração/i)).toBeDefined());
});
