/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResendChargeButton } from "./resend-charge-button";

it("reenvia e mostra 'Reenviado.' em SENT", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, status: "SENT" }), { status: 200 }));
  render(<ResendChargeButton invoiceId="inv_1" />);
  fireEvent.click(screen.getByText("Reenviar boleto/PIX"));
  await waitFor(() => expect(screen.getByText("Reenviado.")).toBeDefined());
  // chamou a rota certa
  expect((global.fetch as any).mock.calls[0][0]).toBe("/api/admin/invoices/inv_1/resend-charge");
});

it("mostra o erro quando a resposta não é ok", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Fatura sem link de pagamento — sincronize a cobrança primeiro" }), { status: 400 }));
  render(<ResendChargeButton invoiceId="inv_2" />);
  fireEvent.click(screen.getByText("Reenviar boleto/PIX"));
  await waitFor(() => expect(screen.getByText(/sincronize a cobrança/i)).toBeDefined());
});
