/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResendChargeButton } from "./resend-charge-button";

it("(a) sem invoiceSent renderiza 'Enviar cobrança'", () => {
  render(<ResendChargeButton invoiceId="inv_1" />);
  expect(screen.getByText("Enviar cobrança")).toBeDefined();
});

it("(b) com invoiceSent + invoiceSentAt renderiza 'Reenviar (enviada DD/MM)'", () => {
  render(<ResendChargeButton invoiceId="inv_1" invoiceSent invoiceSentAt="2026-03-08T12:00:00.000Z" />);
  const btn = screen.getByRole("button");
  expect(btn.textContent).toContain("Reenviar");
  expect(btn.textContent).toContain("08/03");
});

it("(b2) com invoiceSent sem invoiceSentAt renderiza só 'Reenviar'", () => {
  render(<ResendChargeButton invoiceId="inv_1" invoiceSent />);
  const btn = screen.getByRole("button");
  expect(btn.textContent).toContain("Reenviar");
  expect(btn.textContent).not.toContain("enviada");
});

it("(c) sentToday desabilita o botão e mostra 'Já enviada hoje'", () => {
  render(<ResendChargeButton invoiceId="inv_1" invoiceSent invoiceSentAt="2026-03-08T12:00:00.000Z" sentToday />);
  const btn = screen.getByRole("button") as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  expect(btn.textContent).toContain("Já enviada hoje");
});

it("label explícito tem prioridade sobre o estado", () => {
  render(<ResendChargeButton invoiceId="inv_1" invoiceSent invoiceSentAt="2026-03-08T12:00:00.000Z" label="Reenviar boleto/PIX" />);
  expect(screen.getByText("Reenviar boleto/PIX")).toBeDefined();
});

it("(d) reenvia e mostra 'Enviado.' em SENT + chama a rota certa", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, status: "SENT" }), { status: 200 }));
  render(<ResendChargeButton invoiceId="inv_1" />);
  fireEvent.click(screen.getByText("Enviar cobrança"));
  await waitFor(() => expect(screen.getByText("Enviado.")).toBeDefined());
  expect((global.fetch as any).mock.calls[0][0]).toBe("/api/admin/invoices/inv_1/resend-charge");
});

it("(e) resposta alreadySentToday mostra 'Já reenviada hoje'", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, status: "SENT", alreadySentToday: true }), { status: 200 }));
  render(<ResendChargeButton invoiceId="inv_1" />);
  fireEvent.click(screen.getByText("Enviar cobrança"));
  await waitFor(() => expect(screen.getByText("Já reenviada hoje")).toBeDefined());
});

it("mostra o erro quando a resposta não é ok", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Fatura sem link de pagamento — sincronize a cobrança primeiro" }), { status: 400 }));
  render(<ResendChargeButton invoiceId="inv_2" />);
  fireEvent.click(screen.getByText("Enviar cobrança"));
  await waitFor(() => expect(screen.getByText(/sincronize a cobrança/i)).toBeDefined());
});
