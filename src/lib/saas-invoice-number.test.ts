import { describe, it, expect, vi } from "vitest";
import { nextSaasInvoiceNumber } from "./saas-invoice-number";

describe("nextSaasInvoiceNumber", () => {
  it("incrementa atômico e formata INV-NNNNNN", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ value: 43 }]);
    const tx = { $queryRaw } as any;
    const num = await nextSaasInvoiceNumber(tx);
    expect(num).toBe("INV-000043");
    expect($queryRaw).toHaveBeenCalledTimes(1);
  });
});
