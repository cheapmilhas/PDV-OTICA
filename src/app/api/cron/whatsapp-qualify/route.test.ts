import { describe, it, expect, vi, beforeEach } from "vitest";
const qualifyPendingMock = vi.fn();
vi.mock("@/services/conversation-qualifier.service", () => ({ qualifyPendingConversations: (...a: unknown[]) => qualifyPendingMock(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
import { GET } from "./route";
function req(auth?: string) { return new Request("https://x/api/cron/whatsapp-qualify", { headers: auth ? { authorization: auth } : {} }); }

beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = "s3cr3t"; qualifyPendingMock.mockResolvedValue({ processed: 3, leads: 1, errors: 0, skippedCompanies: 0 }); });

describe("GET /api/cron/whatsapp-qualify", () => {
  it("401 sem secret correto", async () => { const res = await GET(req("Bearer errado")); expect(res.status).toBe(401); expect(qualifyPendingMock).not.toHaveBeenCalled(); });
  it("401 fail-closed se CRON_SECRET ausente", async () => { delete process.env.CRON_SECRET; const res = await GET(req("Bearer s3cr3t")); expect(res.status).toBe(401); });
  it("200 + roda a varredura", async () => { const res = await GET(req("Bearer s3cr3t")); expect(res.status).toBe(200); expect(qualifyPendingMock).toHaveBeenCalledWith(); const b = await res.json(); expect(b.leads).toBe(1); });
});
