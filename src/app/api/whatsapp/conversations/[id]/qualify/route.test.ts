import { describe, it, expect, vi, beforeEach } from "vitest";
const getCompanyIdMock = vi.fn();
const requirePermissionMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({ getCompanyId: (...a: unknown[]) => getCompanyIdMock(...a), requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));
const assertAiAllowedMock = vi.fn();
vi.mock("@/lib/ai-guard", () => ({ assertAiAllowed: (...a: unknown[]) => assertAiAllowedMock(...a) }));
const qualifyMock = vi.fn();
vi.mock("@/services/conversation-qualifier.service", () => ({ qualifyConversation: (...a: unknown[]) => qualifyMock(...a) }));
vi.mock("@/lib/prisma", () => ({ prisma: { whatsappConversation: { findUnique: vi.fn() } } }));
import { prisma } from "@/lib/prisma";
import { AppError, ERROR_CODES } from "@/lib/error-handler";
import { POST } from "./route";
function ctx(id: string) { return { params: Promise.resolve({ id }) }; }
const req = () => new Request("https://x", { method: "POST" });

beforeEach(() => { vi.clearAllMocks(); getCompanyIdMock.mockResolvedValue("co1"); assertAiAllowedMock.mockResolvedValue(undefined); });

describe("POST qualify [id]", () => {
  it("404 se conversa não é da empresa", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue(null);
    const res = await POST(req(), ctx("cX"));
    expect(res.status).toBe(404);
    expect(qualifyMock).not.toHaveBeenCalled();
  });
  it("403 se IA bloqueada (assertAiAllowed lança)", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ id: "c1", companyId: "co1" });
    assertAiAllowedMock.mockRejectedValue(new AppError(ERROR_CODES.FORBIDDEN, "bloqueado", 403));
    const res = await POST(req(), ctx("c1"));
    expect(res.status).toBe(403);
    expect(qualifyMock).not.toHaveBeenCalled();
  });
  it("200 e qualifica com force quando ok", async () => {
    (prisma.whatsappConversation.findUnique as any).mockResolvedValue({ id: "c1", companyId: "co1" });
    qualifyMock.mockResolvedValue({ conversationId: "c1", isLead: true, leadId: "lead1" });
    const res = await POST(req(), ctx("c1"));
    expect(res.status).toBe(200);
    expect(qualifyMock).toHaveBeenCalledWith("c1", { force: true });
    const b = await res.json();
    expect(b.leadId).toBe("lead1");
  });
});
