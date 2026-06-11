import { describe, it, expect, vi } from "vitest";
import { sendInvoiceCharge } from "./invoice-send.service";

const NOW = new Date("2026-07-08T12:00:00Z");

function inv(over = {}) {
  return {
    id: "i1",
    total: 14990,
    dueDate: NOW,
    paymentUrl: "https://x/i/1",
    boletoUrl: "https://x/b/1",
    pixCode: "PIX",
    subscription: { companyId: "c1", company: { name: "Ótica X" } },
    ...over,
  };
}

describe("sendInvoiceCharge", () => {
  it("SENT grava invoiceSent + chama ensure", async () => {
    const ensureFn = vi.fn().mockResolvedValue(inv());
    const update = vi.fn().mockResolvedValue({});
    const prismaClient = {
      invoice: { findUnique: vi.fn().mockResolvedValue(inv()), update },
    } as any;
    const notifyFn = vi.fn().mockResolvedValue({ status: "SENT" });

    const out = await sendInvoiceCharge("i1", "admin1", {
      prismaClient,
      ensureFn,
      notifyFn,
      now: NOW,
    });

    expect(ensureFn).toHaveBeenCalledWith("i1");
    expect(out.status).toBe("SENT");
    expect(out.alreadySentToday).toBe(false);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "i1" },
        data: expect.objectContaining({
          invoiceSent: true,
          invoiceSentBy: "admin1",
        }),
      })
    );

    const [companyId, type, , opts] = notifyFn.mock.calls[0];
    expect(companyId).toBe("c1");
    expect(type).toBe("INVOICE_CREATED");
    expect(opts.channels).toEqual(["email"]);
    expect(opts.periodKey).toMatch(/^invoice:i1:resend:\d{8}$/);
  });

  it("SKIPPED duplicate → alreadySentToday true, não grava", async () => {
    const ensureFn = vi.fn().mockResolvedValue(inv());
    const update = vi.fn();
    const prismaClient = {
      invoice: { findUnique: vi.fn().mockResolvedValue(inv()), update },
    } as any;
    const notifyFn = vi
      .fn()
      .mockResolvedValue({ status: "SKIPPED", reason: "duplicate" });

    const out = await sendInvoiceCharge("i1", "admin1", {
      prismaClient,
      ensureFn,
      notifyFn,
      now: NOW,
    });

    expect(out).toEqual({ status: "SKIPPED", alreadySentToday: true });
    expect(update).not.toHaveBeenCalled();
  });

  it("ensure throw → propaga", async () => {
    const ensureFn = vi.fn().mockRejectedValue(new Error("Fatura sem link"));
    const prismaClient = {
      invoice: { findUnique: vi.fn(), update: vi.fn() },
    } as any;

    await expect(
      sendInvoiceCharge("i1", "admin1", {
        prismaClient,
        ensureFn,
        notifyFn: vi.fn(),
        now: NOW,
      })
    ).rejects.toThrow("Fatura sem link");
  });
});
