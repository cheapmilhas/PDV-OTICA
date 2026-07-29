import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do prisma ANTES de importar o módulo sob teste.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn(), updateMany: vi.fn() },
    dunningEvent: { findFirst: vi.fn() },
  },
}));

import { checkSubscription, requireWriteAccess } from "../subscription";
import { prisma } from "@/lib/prisma";

const companyFindUnique = prisma.company.findUnique as unknown as ReturnType<typeof vi.fn>;
const subFindFirst = prisma.subscription.findFirst as unknown as ReturnType<typeof vi.fn>;
const subUpdateMany = prisma.subscription.updateMany as unknown as ReturnType<typeof vi.fn>;
const dunningEventFindFirst = prisma.dunningEvent.findFirst as unknown as ReturnType<
  typeof vi.fn
>;

function mockCompany(
  overrides: Partial<{ accessEnabled: boolean; isBlocked: boolean; name: string }> = {},
) {
  companyFindUnique.mockResolvedValue({
    accessEnabled: false,
    isBlocked: false,
    name: "Test Co",
    ...overrides,
  });
}

function mockPastDue(daysOverdue: number) {
  const pastDueSince = new Date(Date.now() - daysOverdue * 86400 * 1000);
  subFindFirst.mockResolvedValue({
    id: "sub1",
    status: "PAST_DUE",
    pastDueSince,
    currentPeriodEnd: pastDueSince,
    trialEndsAt: null,
    plan: { name: "Pro" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ENFORCE_SUSPENSION;
  delete process.env.SUBSCRIPTION_BYPASS_COMPANY_IDS;
  subUpdateMany.mockResolvedValue({ count: 1 });
  // Default = aviso despachado (encontrou linha na trilha). Os testes que
  // querem o caso "não avisado" sobrescrevem com mockResolvedValue(null).
  dunningEventFindFirst.mockResolvedValue({ id: "evt1" });
});

describe("checkSubscription — Q8.1 suspensão é exclusiva do cron F5", () => {
  it("PAST_DUE recente (2d) → AINDA ESCREVE, NÃO suspende", async () => {
    mockCompany();
    mockPastDue(2);
    const r = await checkSubscription("co1");
    expect(r.allowed).toBe(true);
    expect(r.status).toBe("PAST_DUE");
    expect(r.readOnly).toBe(false);
    expect(subUpdateMany).not.toHaveBeenCalled();
  });

  it("PAST_DUE recente (2d) → NÃO consulta a trilha de dunning (a resposta não muda antes do marco)", async () => {
    mockCompany();
    mockPastDue(2);
    await checkSubscription("co1");
    expect(dunningEventFindFirst).not.toHaveBeenCalled();
  });

  it("PAST_DUE há MUITO tempo (40d), aviso despachado → continua PAST_DUE readOnly, NÃO suspende sozinho", async () => {
    // 40d passa muito do marco de 14d (WRITE_RESTRICTION_DAY): a régua já teria
    // restringido a escrita há tempo. Quem SUSPENDE continua sendo só o cron F5.
    mockCompany();
    mockPastDue(40);
    dunningEventFindFirst.mockResolvedValue({ id: "evt1" });
    const r = await checkSubscription("co1");
    expect(r.status).toBe("PAST_DUE");
    expect(r.readOnly).toBe(true);
    expect(r.allowed).toBe(true);
    expect(subUpdateMany).not.toHaveBeenCalled(); // NÃO escreve SUSPENDED
  });

  it("PAST_DUE além do marco (20d) MAS o aviso NÃO foi despachado → NÃO restringe (o furo que esta entrega fecha)", async () => {
    mockCompany();
    mockPastDue(20);
    dunningEventFindFirst.mockResolvedValue(null); // sem linha SENT/DELIVERED na trilha
    const r = await checkSubscription("co1");
    expect(r.status).toBe("PAST_DUE");
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(false);
  });

  it("PAST_DUE além do marco (20d) e a leitura da trilha lança → NÃO restringe (fail-closed a favor do cliente)", async () => {
    mockCompany();
    mockPastDue(20);
    dunningEventFindFirst.mockRejectedValue(new Error("conexão com o banco caiu"));
    const r = await checkSubscription("co1");
    expect(r.status).toBe("PAST_DUE");
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(false);
  });

  it("PAST_DUE a 13.9 dias (Math.floor) → NÃO restringe ainda (bate com o cron)", async () => {
    // Trava o arredondamento: 13.9 dias tem que dar daysOverdue=13 (floor), não
    // 14 (ceil). Se este gate usasse ceil, restringiria a escrita 1 dia ANTES de
    // o cron de dunning (que usa floor) disparar o aviso final — o cliente
    // perderia acesso antes de a régua terminar de avisar.
    mockCompany();
    mockPastDue(13.9);
    const r = await checkSubscription("co1");
    expect(r.daysOverdue).toBe(13);
    expect(r.readOnly).toBe(false);
  });

  it("status SUSPENDED (vindo do cron F5) → bloqueia acesso", async () => {
    mockCompany();
    subFindFirst.mockResolvedValue({
      id: "sub1",
      status: "SUSPENDED",
      pastDueSince: new Date(),
      plan: { name: "Pro" },
    });
    const r = await checkSubscription("co1");
    expect(r.allowed).toBe(false);
    expect(r.status).toBe("SUSPENDED");
  });
});

describe("checkSubscription — Q8.1 flags de emergência", () => {
  it("ENFORCE_SUSPENSION=false libera mesmo SUSPENDED", async () => {
    process.env.ENFORCE_SUSPENSION = "false";
    mockCompany();
    subFindFirst.mockResolvedValue({
      id: "sub1",
      status: "SUSPENDED",
      pastDueSince: new Date(),
      plan: { name: "Pro" },
    });
    const r = await checkSubscription("co1");
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(false);
    expect(r.message).toContain("ENFORCE_SUSPENSION");
  });

  it("SUBSCRIPTION_BYPASS_COMPANY_IDS libera tenant na whitelist", async () => {
    process.env.SUBSCRIPTION_BYPASS_COMPANY_IDS = "co1, co2";
    mockCompany();
    subFindFirst.mockResolvedValue({
      id: "sub1",
      status: "CANCELED",
      pastDueSince: new Date(),
      plan: { name: "Pro" },
    });
    const r = await checkSubscription("co1");
    expect(r.allowed).toBe(true);
    expect(r.message).toBe("BYPASS_LIST");
  });

  it("BYPASS não afeta tenant fora da whitelist", async () => {
    process.env.SUBSCRIPTION_BYPASS_COMPANY_IDS = "co2,co3";
    mockCompany();
    subFindFirst.mockResolvedValue({
      id: "sub1",
      status: "SUSPENDED",
      pastDueSince: new Date(),
      plan: { name: "Pro" },
    });
    const r = await checkSubscription("co1");
    expect(r.allowed).toBe(false);
    expect(r.status).toBe("SUSPENDED");
  });

  it("flags não interferem no caminho feliz (ACTIVE)", async () => {
    mockCompany();
    subFindFirst.mockResolvedValue({
      id: "sub1",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
      plan: { name: "Pro" },
    });
    const r = await checkSubscription("co1");
    expect(r.allowed).toBe(true);
    expect(r.status).toBe("ACTIVE");
  });
});

describe("requireWriteAccess — contrato de segurança Q8.1", () => {
  beforeEach(() => {
    delete process.env.DISABLE_PLAN_FEATURE_GATING;
  });

  it("PAST_DUE ALÉM do marco (20d) BLOQUEIA escrita com 403", async () => {
    mockCompany();
    mockPastDue(20);
    await expect(requireWriteAccess("co1")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("PAST_DUE dentro da janela de avisos (2d) PERMITE escrita", async () => {
    mockCompany();
    mockPastDue(2);
    await expect(requireWriteAccess("co1")).resolves.not.toThrow();
  });

  it("ACTIVE permite escrita (não lança)", async () => {
    mockCompany();
    subFindFirst.mockResolvedValue({
      id: "sub1",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
      plan: { name: "Pro" },
    });
    await expect(requireWriteAccess("co1")).resolves.toBeUndefined();
  });

  it("ENFORCE_SUSPENSION=false libera escrita mesmo PAST_DUE", async () => {
    process.env.ENFORCE_SUSPENSION = "false";
    mockCompany();
    mockPastDue(40);
    await expect(requireWriteAccess("co1")).resolves.toBeUndefined();
  });

  it("DISABLE_PLAN_FEATURE_GATING=true libera escrita (kill-switch global)", async () => {
    process.env.DISABLE_PLAN_FEATURE_GATING = "true";
    // nem consulta o banco — retorna cedo
    await expect(requireWriteAccess("co1")).resolves.toBeUndefined();
  });
});
