import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/admin-session", () => ({ getAdminSession: vi.fn() }));
vi.mock("@/services/invoice-reminders.service", () => ({ runInvoiceReminders: vi.fn().mockResolvedValue({ skipped: null, invoiceCreatedEmails: 2, dueSoonEmails: 1, runAt: "x" }) }));
import { POST } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { runInvoiceReminders } from "@/services/invoice-reminders.service";

beforeEach(() => vi.clearAllMocks());

it("401 sem sessão", async () => {
  (getAdminSession as any).mockResolvedValue(null);
  const res = await POST(new Request("http://x", { method: "POST" }));
  expect(res.status).toBe(401);
});
it("403 não-SUPER_ADMIN", async () => {
  (getAdminSession as any).mockResolvedValue({ id: "a", role: "SUPPORT" });
  const res = await POST(new Request("http://x", { method: "POST" }));
  expect(res.status).toBe(403);
  expect(runInvoiceReminders).not.toHaveBeenCalled();
});
it("SUPER_ADMIN → roda motor e retorna RunSummary", async () => {
  (getAdminSession as any).mockResolvedValue({ id: "a", role: "SUPER_ADMIN" });
  (runInvoiceReminders as any).mockResolvedValue({ skipped: null, invoiceCreatedEmails: 2, dueSoonEmails: 1, runAt: "x" });
  const res = await POST(new Request("http://x", { method: "POST" }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.invoiceCreatedEmails).toBe(2);
  expect(runInvoiceReminders).toHaveBeenCalledTimes(1);
});
