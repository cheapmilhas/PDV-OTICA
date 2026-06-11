/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NovaCobrancaButton } from "./nova-cobranca-button";

it("(a) renderiza o botão 'Nova cobrança'", () => {
  render(<NovaCobrancaButton companyId="cmp_1" />);
  expect(screen.getByText("Nova cobrança")).toBeDefined();
});

it("(a2) respeita o label customizado", () => {
  render(<NovaCobrancaButton companyId="cmp_1" label="Cobrar empresa" />);
  expect(screen.getByText("Cobrar empresa")).toBeDefined();
});

it("(b) clicar abre o modal com campos de valor e descrição", () => {
  render(<NovaCobrancaButton companyId="cmp_1" />);
  expect(screen.queryByText(/Descrição/i)).toBeNull();
  fireEvent.click(screen.getByText("Nova cobrança"));
  expect(screen.getByText(/Descrição/i)).toBeDefined();
  expect(screen.getByPlaceholderText("0,00")).toBeDefined();
});

it("(c) aviso de modo teste visível ao abrir", () => {
  render(<NovaCobrancaButton companyId="cmp_1" />);
  fireEvent.click(screen.getByText("Nova cobrança"));
  expect(screen.getByText(/modo teste afeta apenas o email/i)).toBeDefined();
});

it("(c2) cancelar fecha o modal", () => {
  render(<NovaCobrancaButton companyId="cmp_1" />);
  fireEvent.click(screen.getByText("Nova cobrança"));
  expect(screen.getByText(/modo teste afeta apenas o email/i)).toBeDefined();
  fireEvent.click(screen.getByText("Cancelar"));
  expect(screen.queryByText(/modo teste afeta apenas o email/i)).toBeNull();
});

it("(d) submit chama /api/admin/charges com amount em centavos", async () => {
  const fetchMock = vi
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ success: true, emailStatus: "SENT" }), { status: 200 }));
  render(<NovaCobrancaButton companyId="cmp_1" />);
  fireEvent.click(screen.getByText("Nova cobrança"));
  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText(/Descrição/i), { target: { value: "Teste" } });
  fireEvent.click(screen.getByText("Criar cobrança"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect((global.fetch as any).mock.calls[0][0]).toBe("/api/admin/charges");
  const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
  expect(body.amount).toBe(500);
  expect(body.companyId).toBe("cmp_1");
  expect(body.description).toBe("Teste");
  expect(body.source).toBe("other");
});

it("(e) sucesso SENT mostra 'Email enviado.'", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ success: true, emailStatus: "SENT" }), { status: 200 }),
  );
  render(<NovaCobrancaButton companyId="cmp_1" />);
  fireEvent.click(screen.getByText("Nova cobrança"));
  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText(/Descrição/i), { target: { value: "Teste" } });
  fireEvent.click(screen.getByText("Criar cobrança"));
  await waitFor(() => expect(screen.getByText(/Email enviado/i)).toBeDefined());
});

it("(f) sucesso sem envio mostra status do email", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ success: true, emailStatus: "SKIPPED" }), { status: 200 }),
  );
  render(<NovaCobrancaButton companyId="cmp_1" />);
  fireEvent.click(screen.getByText("Nova cobrança"));
  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText(/Descrição/i), { target: { value: "Teste" } });
  fireEvent.click(screen.getByText("Criar cobrança"));
  await waitFor(() => expect(screen.getByText(/Email não enviado \(SKIPPED\)/i)).toBeDefined());
});

it("(g) erro mostra a mensagem da resposta", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "Empresa sem cliente Asaas" }), { status: 400 }),
  );
  render(<NovaCobrancaButton companyId="cmp_1" />);
  fireEvent.click(screen.getByText("Nova cobrança"));
  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText(/Descrição/i), { target: { value: "Teste" } });
  fireEvent.click(screen.getByText("Criar cobrança"));
  await waitFor(() => expect(screen.getByText(/sem cliente Asaas/i)).toBeDefined());
});
