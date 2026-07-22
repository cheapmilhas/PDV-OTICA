import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import {
  buildEntitlementPayload,
  tryPublishEntitlementForCompany,
  tryRevokeEntitlementForClinic,
} from "../vis-domus-publisher";
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
    checkSub.mockResolvedValue({ allowed: true, readOnly: false, status: "ACTIVE", planName: "Clínica" });

    const r = await buildEntitlementPayload("c1", NOW);
    expect(r).not.toBeNull();
    const p = r!;
    // Com tier → v2 com plan.tier.
    expect(p.version).toBe(2);
    if (p.version === 2) expect(p.plan.tier).toBe("clinic_full");
    // STRING decimal, NÃO bigint (JSON.stringify quebraria com bigint).
    expect(p.sourceRevision).toBe("42");
    expect(typeof p.sourceRevision).toBe("string");
    expect(p.entitlement.writeAllowed).toBe(true);
    expect(p.domusClinicId).toBe("d1");
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
    checkSub.mockResolvedValue({ allowed: false, readOnly: false, status: "SUSPENDED", planName: "Pro" });

    const p = (await buildEntitlementPayload("c1", NOW))!;
    // sem revisão → sourceRevision ausente (não emitido). Mas tem tier → v2.
    expect(p.sourceRevision).toBeUndefined();
    expect(p.version).toBe(2);
    if (p.version === 2) expect(p.plan.tier).toBe("specialist");
    expect(p.entitlement.writeAllowed).toBe(false);
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
    checkSub.mockResolvedValue({ allowed: true, readOnly: false, status: "ACTIVE", planName: "Clínica" });

    const r = await buildEntitlementPayload("c1", NOW);
    // Não deve lançar — é o que publishEntitlementForCompany faz antes do fetch.
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(JSON.parse(JSON.stringify(r)).sourceRevision).toBe("9007199254740993");
  });

  it("ramo sem subscription → v1 (sem plan.tier), ainda publica writeAllowed", async () => {
    txMock.company.findUnique.mockResolvedValue({
      id: "c1",
      platformProduct: "VIS_MEDICAL",
      domusClinicId: "d1",
      updatedAt: NOW,
    });
    txMock.subscription.findFirst.mockResolvedValue(null);
    txMock.entitlementRevision.findUnique.mockResolvedValue({ revision: BigInt("7") });
    checkSub.mockResolvedValue({ allowed: false, readOnly: false, status: "NO_SUBSCRIPTION" });

    const r = await buildEntitlementPayload("c1", NOW);
    // Sem tier → continua v1 (o Domus preserva o tier gravado). Nunca v2 sem tier.
    expect(r!.version).toBe(1);
    expect(r).not.toHaveProperty("plan");
    expect(r!.sourceRevision).toBe("7");
    expect(r!.entitlement.writeAllowed).toBe(false);
  });

  it("PAST_DUE (readOnly:true) → payload emitido tem entitlement.writeAllowed=false (integração projetor→payload)", async () => {
    // checkSubscription dá allowed:true + readOnly:true no grace period (PAST_DUE).
    // O guard local do Vis bloqueia escrita; o payload pro Domus TEM de espelhar
    // (writeAllowed:false) ou a clínica inadimplente escreveria no Domus enquanto
    // está bloqueada no Vis. Prova o caminho readOnly de ponta a ponta.
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
    txMock.entitlementRevision.findUnique.mockResolvedValue({ revision: BigInt("99") });
    checkSub.mockResolvedValue({ allowed: true, readOnly: true, status: "PAST_DUE", planName: "Clínica" });

    const p = (await buildEntitlementPayload("c1", NOW))!;
    expect(p.entitlement.writeAllowed).toBe(false);
    expect(p.subscriptionStatus).toBe("PAST_DUE");
    // readOnly corta a escrita mesmo com allowed:true.
    expect(p.entitlement.reason).toBe("PAST_DUE");
  });
});

describe("tryPublishEntitlementForCompany (resultado tipado p/ o worker do outbox)", () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    // Restaura env a cada caso (cada teste liga/desliga secret+url explicitamente).
    process.env = { ...OLD_ENV };
    // fetch é global; mocka por teste (o publisher usa fetch(...)).
    vi.stubGlobal("fetch", vi.fn());
  });

  // Arruma o prisma mock p/ uma company VIS_MEDICAL vinculada com payload válido
  // (mesmo estilo dos testes de buildEntitlementPayload — não mocka a função).
  function arrangePublishablePayload() {
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
    checkSub.mockResolvedValue({
      allowed: true,
      readOnly: false,
      status: "ACTIVE",
      planName: "Clínica",
    });
  }

  it("config ausente (sem secret/url) → failed", async () => {
    delete process.env.VIS_DOMUS_WEBHOOK_SECRET;
    delete process.env.DOMUS_WEBHOOK_URL;
    const r = await tryPublishEntitlementForCompany("c1");
    expect(r.kind).toBe("failed");
  });

  it("company não-medical / sem vínculo (payload null) → noop", async () => {
    process.env.VIS_DOMUS_WEBHOOK_SECRET = "sekret";
    process.env.DOMUS_WEBHOOK_URL = "https://domus.example";
    // company não-VIS_MEDICAL → buildEntitlementPayload retorna null.
    txMock.company.findUnique.mockResolvedValue({
      id: "c1",
      platformProduct: "VIS_APP",
      domusClinicId: null,
      updatedAt: NOW,
    });
    const r = await tryPublishEntitlementForCompany("c1");
    expect(r.kind).toBe("noop");
    // noop não deve nem tentar a rede.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetch { ok: true } → published", async () => {
    process.env.VIS_DOMUS_WEBHOOK_SECRET = "sekret";
    process.env.DOMUS_WEBHOOK_URL = "https://domus.example";
    arrangePublishablePayload();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });
    const r = await tryPublishEntitlementForCompany("c1");
    expect(r.kind).toBe("published");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fetch { ok: false, status: 500 } → failed", async () => {
    process.env.VIS_DOMUS_WEBHOOK_SECRET = "sekret";
    process.env.DOMUS_WEBHOOK_URL = "https://domus.example";
    arrangePublishablePayload();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });
    const r = await tryPublishEntitlementForCompany("c1");
    expect(r.kind).toBe("failed");
    if (r.kind === "failed") expect(r.reason).toContain("500");
  });

  it("fetch lança (rede) → failed", async () => {
    process.env.VIS_DOMUS_WEBHOOK_SECRET = "sekret";
    process.env.DOMUS_WEBHOOK_URL = "https://domus.example";
    arrangePublishablePayload();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNRESET"));
    const r = await tryPublishEntitlementForCompany("c1");
    expect(r.kind).toBe("failed");
    if (r.kind === "failed") expect(r.reason).toBe("ECONNRESET");
  });
});

describe("tryRevokeEntitlementForClinic — revoga clinicId orfao", () => {
  const CLINIC = "00000000-0000-4000-8000-000000000abc"; // UUID valido (Domus exige)
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    // Não vaza o stub de fetch para outras suites (o arquivo não tem afterEach global).
    vi.unstubAllGlobals();
    process.env = { ...OLD_ENV };
  });

  it("config ausente → failed", async () => {
    delete process.env.VIS_DOMUS_WEBHOOK_SECRET;
    delete process.env.DOMUS_WEBHOOK_URL;
    const r = await tryRevokeEntitlementForClinic("visco-1", CLINIC, "42", "UNLINKED");
    expect(r.kind).toBe("failed");
  });

  it("fetch 2xx → published; body casa com validateSnapshot", async () => {
    process.env.VIS_DOMUS_WEBHOOK_SECRET = "s"; process.env.DOMUS_WEBHOOK_URL = "https://d";
    let sentBody: any;
    vi.stubGlobal("fetch", vi.fn(async (_u, init: any) => { sentBody = JSON.parse(init.body); return { ok: true } as Response; }));
    const r = await tryRevokeEntitlementForClinic("visco-1", CLINIC, "42", "COMPANY_DELETED");
    expect(r.kind).toBe("published");
    expect(sentBody.version).toBe(1);
    expect(sentBody.visCompanyId).toBe("visco-1");
    expect(sentBody.domusClinicId).toBe(CLINIC);
    expect(sentBody.sourceRevision).toBe("42");
    expect(sentBody.planName).toBeNull();
    expect(sentBody.entitlement).toEqual({ writeAllowed: false, reason: "COMPANY_DELETED" });
    expect(typeof sentBody.eventId).toBe("string");
    expect(typeof sentBody.sourceUpdatedAt).toBe("string");
  });

  it("fetch !ok → failed", async () => {
    process.env.VIS_DOMUS_WEBHOOK_SECRET = "s"; process.env.DOMUS_WEBHOOK_URL = "https://d";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409 } as Response)));
    const r = await tryRevokeEntitlementForClinic("visco-1", CLINIC, "42", "UNLINKED");
    expect(r.kind).toBe("failed");
  });
});
