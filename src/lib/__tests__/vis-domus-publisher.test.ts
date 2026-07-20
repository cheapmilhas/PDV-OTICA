import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do prisma: $transaction executa o callback com um "tx" que é o próprio
// objeto de mocks (as leituras do publisher rodam nele). vi.hoisted: o txMock
// precisa existir ANTES da factory içada do vi.mock.
const txMock = vi.hoisted(() => ({
  company: { findUnique: vi.fn() },
  subscription: { findFirst: vi.fn(), updateMany: vi.fn() },
  entitlementRevision: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...txMock,
    // interactive transaction: roda o callback com o tx mock.
    $transaction: (fn: (tx: typeof txMock) => unknown) => fn(txMock),
  },
}));

// checkSubscription é chamado dentro da tx — mock pra isolar o publisher.
vi.mock("@/lib/subscription", () => ({
  checkSubscription: vi.fn(),
}));

import { buildEntitlementPayload } from "../vis-domus-publisher";
import { checkSubscription } from "@/lib/subscription";

const checkSub = checkSubscription as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

const NOW = new Date("2026-07-19T12:00:00.000Z");

describe("buildEntitlementPayload (V3b — snapshot atômico)", () => {
  it("company não-VIS_MEDICAL → null (nada a publicar)", async () => {
    txMock.company.findUnique.mockResolvedValue({
      id: "c1",
      platformProduct: "VIS_APP",
      domusClinicId: null,
      updatedAt: NOW,
    });
    const r = await buildEntitlementPayload("c1", NOW);
    expect(r).toBeNull();
  });

  it("company VIS_MEDICAL sem vínculo (domusClinicId null) → null", async () => {
    txMock.company.findUnique.mockResolvedValue({
      id: "c1",
      platformProduct: "VIS_MEDICAL",
      domusClinicId: null,
      updatedAt: NOW,
    });
    expect(await buildEntitlementPayload("c1", NOW)).toBeNull();
  });

  it("captura sourceRevision e planTier no snapshot coerente", async () => {
    txMock.company.findUnique.mockResolvedValue({
      id: "c1",
      platformProduct: "VIS_MEDICAL",
      domusClinicId: "d1",
      updatedAt: NOW,
    });
    txMock.subscription.findFirst.mockResolvedValue({
      updatedAt: NOW,
      plan: { name: "Clínica", tier: "clinic_full" },
    });
    txMock.entitlementRevision.findUnique.mockResolvedValue({ revision: BigInt("42") });
    checkSub.mockResolvedValue({ allowed: true, status: "ACTIVE", planName: "Clínica" });

    const r = await buildEntitlementPayload("c1", NOW);
    expect(r).not.toBeNull();
    // STRING decimal, NÃO bigint (JSON.stringify quebraria com bigint).
    expect(r!.sourceRevision).toBe("42");
    expect(typeof r!.sourceRevision).toBe("string");
    expect(r!.planTier).toBe("clinic_full");
    expect(r!.entitlement.writeAllowed).toBe(true);
    expect(r!.domusClinicId).toBe("d1");
    // checkSubscription roda DENTRO da tx (recebe o tx mock como 2º arg).
    expect(checkSub).toHaveBeenCalledWith("c1", txMock);
  });

  it("sem linha de EntitlementRevision → sourceRevision null (não quebra)", async () => {
    txMock.company.findUnique.mockResolvedValue({
      id: "c1",
      platformProduct: "VIS_MEDICAL",
      domusClinicId: "d1",
      updatedAt: NOW,
    });
    txMock.subscription.findFirst.mockResolvedValue({
      updatedAt: NOW,
      plan: { name: "Pro", tier: "specialist" },
    });
    txMock.entitlementRevision.findUnique.mockResolvedValue(null);
    checkSub.mockResolvedValue({ allowed: false, status: "SUSPENDED", planName: "Pro" });

    const r = await buildEntitlementPayload("c1", NOW);
    expect(r!.sourceRevision).toBeNull();
    expect(r!.planTier).toBe("specialist");
    expect(r!.entitlement.writeAllowed).toBe(false);
  });

  it("o payload SEMPRE serializa em JSON (P0 Codex: bigint quebraria a publicação)", async () => {
    txMock.company.findUnique.mockResolvedValue({
      id: "c1",
      platformProduct: "VIS_MEDICAL",
      domusClinicId: "d1",
      updatedAt: NOW,
    });
    txMock.subscription.findFirst.mockResolvedValue({
      updatedAt: NOW,
      plan: { name: "Clínica", tier: "clinic_full" },
    });
    // revisão grande (> 2^53) — se vazasse como bigint, JSON.stringify lançaria.
    txMock.entitlementRevision.findUnique.mockResolvedValue({
      revision: BigInt("9007199254740993"),
    });
    checkSub.mockResolvedValue({ allowed: true, status: "ACTIVE", planName: "Clínica" });

    const r = await buildEntitlementPayload("c1", NOW);
    // Não deve lançar — é o que publishEntitlementForCompany faz antes do fetch.
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(JSON.parse(JSON.stringify(r)).sourceRevision).toBe("9007199254740993");
  });

  it("ramo sem subscription → planTier null, ainda publica writeAllowed", async () => {
    txMock.company.findUnique.mockResolvedValue({
      id: "c1",
      platformProduct: "VIS_MEDICAL",
      domusClinicId: "d1",
      updatedAt: NOW,
    });
    txMock.subscription.findFirst.mockResolvedValue(null);
    txMock.entitlementRevision.findUnique.mockResolvedValue({ revision: BigInt("7") });
    checkSub.mockResolvedValue({ allowed: false, status: "NO_SUBSCRIPTION" });

    const r = await buildEntitlementPayload("c1", NOW);
    expect(r!.planTier).toBeNull();
    expect(r!.sourceRevision).toBe("7");
  });
});
