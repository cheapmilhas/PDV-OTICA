import { describe, it, expect, vi, beforeEach } from "vitest";

const notifyCompany = vi.fn().mockResolvedValue({ status: "SENT" });
vi.mock("@/services/saas-notification.service", () => ({
  notifyCompany: (...a: unknown[]) => notifyCompany(...a),
}));

import { sendWelcomeEmail } from "./saas-welcome.service";

describe("sendWelcomeEmail", () => {
  beforeEach(() => notifyCompany.mockClear());

  it("chama notifyCompany com WELCOME, periodKey 'welcome' e payload name+loginUrl", async () => {
    await sendWelcomeEmail("c1", "João");
    expect(notifyCompany).toHaveBeenCalledTimes(1);
    const [companyId, eventType, payload, opts] = notifyCompany.mock.calls[0];
    expect(companyId).toBe("c1");
    expect(eventType).toBe("WELCOME");
    expect(payload).toEqual(expect.objectContaining({ name: "João", loginUrl: expect.stringContaining("/login") }));
    expect(opts).toEqual(expect.objectContaining({ periodKey: "welcome", channels: ["email", "inapp"] }));
    expect(opts.inapp).toBeDefined();
  });
});
