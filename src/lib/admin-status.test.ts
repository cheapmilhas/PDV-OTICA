import { describe, it, expect } from "vitest";
import { adminStatusVariant, adminStatusLabel } from "./admin-status";

describe("adminStatusVariant", () => {
  it("mapeia status de subscription", () => {
    expect(adminStatusVariant("subscription", "ACTIVE")).toBe("success");
    expect(adminStatusVariant("subscription", "TRIAL")).toBe("info");
    expect(adminStatusVariant("subscription", "PAST_DUE")).toBe("danger");
    expect(adminStatusVariant("subscription", "SUSPENDED")).toBe("danger");
    expect(adminStatusVariant("subscription", "CANCELED")).toBe("neutral");
    expect(adminStatusVariant("subscription", "TRIAL_EXPIRED")).toBe("warning");
    expect(adminStatusVariant("subscription", "NO_SUBSCRIPTION")).toBe("neutral");
  });

  it("mapeia status de invoice (inclui REFUNDED)", () => {
    expect(adminStatusVariant("invoice", "PAID")).toBe("success");
    expect(adminStatusVariant("invoice", "PENDING")).toBe("warning");
    expect(adminStatusVariant("invoice", "OVERDUE")).toBe("danger");
    expect(adminStatusVariant("invoice", "CANCELED")).toBe("neutral");
    expect(adminStatusVariant("invoice", "DRAFT")).toBe("neutral");
    expect(adminStatusVariant("invoice", "REFUNDED")).toBe("neutral");
  });

  it("mapeia status de ticket (WAITING_CUSTOMER é o valor real do enum)", () => {
    expect(adminStatusVariant("ticket", "OPEN")).toBe("info");
    expect(adminStatusVariant("ticket", "WAITING_CUSTOMER")).toBe("warning");
    expect(adminStatusVariant("ticket", "RESOLVED")).toBe("success");
  });

  it("cai em neutral para status desconhecido", () => {
    expect(adminStatusVariant("subscription", "FOOBAR")).toBe("neutral");
  });

  it("retorna label legível", () => {
    expect(adminStatusLabel("subscription", "ACTIVE")).toBe("Ativo");
    expect(adminStatusLabel("invoice", "OVERDUE")).toBe("Vencida");
    expect(adminStatusLabel("invoice", "REFUNDED")).toBe("Reembolsada");
    expect(adminStatusLabel("ticket", "WAITING_CUSTOMER")).toBe("Aguardando cliente");
    expect(adminStatusLabel("subscription", "FOOBAR")).toBe("FOOBAR");
  });
});
