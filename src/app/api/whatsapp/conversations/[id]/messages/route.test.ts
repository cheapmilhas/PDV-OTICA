import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAuthMock = vi.fn();
const getCompanyIdMock = vi.fn();
const requirePermissionMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: (...a: unknown[]) => requireAuthMock(...a),
  getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a),
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

const getMessagesMock = vi.fn();
vi.mock("@/services/whatsapp-inbox.service", () => ({
  getConversationMessages: (...a: unknown[]) => getMessagesMock(...a),
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

const req = () => new NextRequest("https://x/api/whatsapp/conversations/c1/messages");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ user: { id: "u1" } });
  getCompanyIdMock.mockResolvedValue("co1");
  requirePermissionMock.mockResolvedValue(undefined);
});

describe("GET /api/whatsapp/conversations/[id]/messages", () => {
  it("404 quando a conversa não é da empresa (service retorna null)", async () => {
    getMessagesMock.mockResolvedValue(null);
    const res = await GET(req(), ctx("c1"));
    expect(res.status).toBe(404);
  });

  it("200 com as mensagens quando é da empresa", async () => {
    getMessagesMock.mockResolvedValue([
      { id: "m1", direction: "inbound", type: "text", text: "oi", receivedAt: new Date() },
    ]);
    const res = await GET(req(), ctx("c1"));
    expect(res.status).toBe(200);
    expect(getMessagesMock).toHaveBeenCalledWith("co1", "c1");
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it("exige leads.access", async () => {
    getMessagesMock.mockResolvedValue([]);
    await GET(req(), ctx("c1"));
    expect(requirePermissionMock).toHaveBeenCalledWith("leads.access");
  });
});
