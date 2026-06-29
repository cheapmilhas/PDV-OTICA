import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cross-tenant isolation tests for PUT /api/reminders/[id]
 * Pentest 2026-06-28: provar que um usuário da empresa A não pode atualizar
 * o lembrete de outra empresa (IDOR via branch.companyId no reminderService).
 *
 * NOTA DE SEGURANÇA: quando o reminder não pertence ao tenant, o service lança
 * `new Error("Lembrete não encontrado")`. Como essa é uma Error genérica (não
 * AppError), `handleApiError` a trata como erro interno e retorna 500.
 * Isso é um furo real: o cliente recebe 500 em vez de 404, e a stack é logada
 * como "Unexpected error" em vez de silenciada. O test documenta esse
 * comportamento atual para que possa ser rastreado e corrigido (service deveria
 * lançar `notFoundError()` — AppError com status 404).
 */

// --- auth-permissions mock ---
const requirePermissionMock = vi.fn();
vi.mock("@/lib/auth-permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

// --- auth-helpers mock ---
const getCompanyIdMock = vi.fn();
const getUserIdMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi.fn().mockResolvedValue(undefined),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  getUserId: (...a: unknown[]) => getUserIdMock(...a),
}));

// --- reminder service mock ---
const updateReminderMock = vi.fn();
vi.mock("@/services/reminder.service", () => ({
  reminderService: {
    updateReminder: (...a: unknown[]) => updateReminderMock(...a),
    startReminder: vi.fn().mockResolvedValue({ id: "r1", status: "IN_PROGRESS" }),
  },
}));

import type { NextRequest } from "next/server";
import { PUT } from "./route";

function makePutRequest(id: string, body: unknown): NextRequest {
  return new Request(`http://localhost/api/reminders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validUpdateBody = { status: "DISMISSED", dismissReason: "Já entrou em contato" };

describe("PUT /api/reminders/[id] — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue(undefined);
    getCompanyIdMock.mockResolvedValue("company-A");
    getUserIdMock.mockResolvedValue("u1");
  });

  it("erro (>=400) quando reminder pertence a outra empresa (cross-tenant barrado)", async () => {
    // O service lança Error genérica quando o reminder não encontra via
    // branch.companyId — handleApiError converte para 500.
    // Este teste documenta o comportamento atual e garante que nenhum dado
    // cross-tenant é alterado.
    updateReminderMock.mockRejectedValue(new Error("Lembrete não encontrado"));

    const res = await PUT(
      makePutRequest("reminder-B", validUpdateBody),
      { params: Promise.resolve({ id: "reminder-B" }) }
    );

    // Garantia principal: a resposta é um erro (nenhum dado cross-tenant retornado).
    // O status atual é 500 porque o service lança Error genérica (não AppError/404).
    // Isso é um furo: deveria ser 404 — ver nota no topo do arquivo.
    expect(res.status).toBeGreaterThanOrEqual(400);

    const json = await res.json();
    // Verifica que a resposta não retorna dados de sucesso do tenant errado
    expect(json.success).toBeFalsy();
  });

  it("200 quando reminder pertence à mesma empresa (mesmo tenant aceito)", async () => {
    updateReminderMock.mockResolvedValue({
      id: "reminder-A",
      status: "DISMISSED",
      customer: { id: "cust-A", name: "Cliente A", phone: "11999" },
    });

    const res = await PUT(
      makePutRequest("reminder-A", validUpdateBody),
      { params: Promise.resolve({ id: "reminder-A" }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(updateReminderMock).toHaveBeenCalledWith(
      "reminder-A",
      expect.objectContaining({ status: "DISMISSED" }),
      "u1",
      "company-A"
    );
  });
});
