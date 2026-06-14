import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/services/invoice-reminders.service", () => ({ runInvoiceReminders: vi.fn().mockResolvedValue({ skipped: null, invoiceCreatedEmails: 0, runAt: "x" }) }));
import { GET } from "./route";
import { runInvoiceReminders } from "@/services/invoice-reminders.service";

beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = "sekret"; });

it("401 sem Bearer", async () => {
  const res = await GET(new Request("http://x/api/cron/invoice-reminders"));
  expect(res.status).toBe(401);
  expect(runInvoiceReminders).not.toHaveBeenCalled();
});
it("200 com Bearer correto e chama o motor", async () => {
  (runInvoiceReminders as ReturnType<typeof vi.fn>).mockResolvedValue({ skipped: null, invoiceCreatedEmails: 0, runAt: "x" });
  const res = await GET(new Request("http://x/api/cron/invoice-reminders", { headers: { authorization: "Bearer sekret" } }));
  expect(res.status).toBe(200);
  expect(runInvoiceReminders).toHaveBeenCalledTimes(1);
});
