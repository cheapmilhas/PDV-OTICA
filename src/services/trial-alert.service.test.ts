/**
 * N5 — testes da lógica do alerta ao operador.
 *
 * Cada bloco trava um defeito que o challenge do Codex encontrou (2026-07-27).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const adminFindMany = vi.fn();
const notificationCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findMany: (...a: unknown[]) => adminFindMany(...a) },
    adminNotification: { create: (...a: unknown[]) => notificationCreate(...a) },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) },
}));

import {
  trialAlertPeriodKey,
  trialAlertLink,
  trialAlertContent,
  alertOperators,
  TRIAL_ALERT_ROLES,
} from "./trial-alert.service";

describe("trialAlertPeriodKey — a chave que impede o sino de virar ruído", () => {
  const fim = new Date("2026-08-01T12:00:00Z");

  it("mesma assinatura + mesma data = mesma chave (não realerta no dia seguinte)", () => {
    expect(trialAlertPeriodKey("sub1", fim)).toBe(trialAlertPeriodKey("sub1", fim));
  });

  it("assinaturas DIFERENTES que vencem no mesmo dia NÃO colidem", () => {
    // 🔥 Se a chave fosse só a data, o segundo cliente nunca seria notificado —
    // o unique barraria a inserção e o operador nem saberia que existe.
    expect(trialAlertPeriodKey("sub1", fim)).not.toBe(trialAlertPeriodKey("sub2", fim));
  });

  it("ESTENDER o trial gera chave nova (realerta para o novo prazo)", () => {
    // 🔥 Se a chave fosse só o subscriptionId, estender o trial silenciaria o
    // alerta para sempre — justamente quando o operador precisa acompanhar.
    const estendido = new Date("2026-08-08T12:00:00Z");
    expect(trialAlertPeriodKey("sub1", fim)).not.toBe(trialAlertPeriodKey("sub1", estendido));
  });

  it("a chave é estável e legível (dá para depurar no banco)", () => {
    expect(trialAlertPeriodKey("sub1", fim)).toBe("trial:sub1:2026-08-01T12:00:00.000Z");
  });
});

describe("trialAlertLink — por que não aponta direto para a ficha", () => {
  it("usa a rota intermediária, não /admin/clientes/<id>", () => {
    // 🔥 A ficha faz notFound() quando o produto da empresa difere do cookie
    // ativo. Alerta de clínica clicado com o painel em ótica daria 404, e o
    // operador acharia que o cliente sumiu. O cookie é httpOnly, então a troca
    // TEM que acontecer no servidor.
    const link = trialAlertLink("co1");
    expect(link).toBe("/admin/ir/cliente/co1");
    expect(link).not.toContain("/admin/clientes/");
  });
});

describe("TRIAL_ALERT_ROLES — quem recebe", () => {
  it("inclui SUPER_ADMIN e ADMIN", () => {
    expect(TRIAL_ALERT_ROLES).toContain("SUPER_ADMIN");
    expect(TRIAL_ALERT_ROLES).toContain("ADMIN");
  });

  it("NÃO inclui SUPPORT — é o default de AdminUser.role", () => {
    // Incluir SUPPORT faria toda conta nova nascer recebendo alerta comercial.
    expect(TRIAL_ALERT_ROLES).not.toContain("SUPPORT");
  });

  it("NÃO inclui BILLING", () => {
    expect(TRIAL_ALERT_ROLES).not.toContain("BILLING");
  });
});

describe("alertOperators — PAPEL não é ESCOPO", () => {
  const alvo = {
    subscriptionId: "sub1",
    companyId: "co-alvo",
    companyName: "Clínica Vida",
    trialEndsAt: new Date("2026-08-01T12:00:00Z"),
    daysLeft: 2,
  };

  beforeEach(() => {
    adminFindMany.mockReset();
    notificationCreate.mockReset().mockResolvedValue({ id: "n1" });
  });

  it("NÃO alerta admin restrito a OUTRAS empresas", async () => {
    // 🚨 O defeito que o Codex achou. Filtrar só por papel entregaria nome do
    // cliente, prazo, companyId e link para um ADMIN fora do escopo — e a API
    // do sino devolve a notificação inteira ao destinatário.
    adminFindMany.mockResolvedValue([
      { id: "a1", role: "ADMIN", scopeAllCompanies: false, scopedCompanyIds: ["outra-co"] },
    ]);
    const criadas = await alertOperators(alvo);
    expect(criadas).toBe(0);
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("alerta admin restrito QUE INCLUI esta empresa", async () => {
    adminFindMany.mockResolvedValue([
      { id: "a1", role: "ADMIN", scopeAllCompanies: false, scopedCompanyIds: ["co-alvo"] },
    ]);
    expect(await alertOperators(alvo)).toBe(1);
  });

  it("SUPER_ADMIN recebe mesmo com scopeAllCompanies false", async () => {
    adminFindMany.mockResolvedValue([
      { id: "su", role: "SUPER_ADMIN", scopeAllCompanies: false, scopedCompanyIds: [] },
    ]);
    expect(await alertOperators(alvo)).toBe(1);
  });

  it("uma linha POR ADMIN elegível — direcionada, nunca global", async () => {
    adminFindMany.mockResolvedValue([
      { id: "a1", role: "ADMIN", scopeAllCompanies: true, scopedCompanyIds: [] },
      { id: "a2", role: "SUPER_ADMIN", scopeAllCompanies: true, scopedCompanyIds: [] },
    ]);
    expect(await alertOperators(alvo)).toBe(2);
    // adminId sempre preenchido: broadcast (null) não pode ser marcado como lido
    for (const call of notificationCreate.mock.calls) {
      expect(call[0].data.adminId).toBeTruthy();
      expect(call[0].data.periodKey).toBe(trialAlertPeriodKey("sub1", alvo.trialEndsAt));
    }
  });

  it("NUNCA lança, mesmo se o banco cair — o cron não pode parar por isso", async () => {
    adminFindMany.mockRejectedValue(new Error("banco fora"));
    await expect(alertOperators(alvo)).resolves.toBe(0);
  });

  it("P2002 é duplicata esperada: não conta, não lança, não interrompe o resto", async () => {
    adminFindMany.mockResolvedValue([
      { id: "a1", role: "ADMIN", scopeAllCompanies: true, scopedCompanyIds: [] },
      { id: "a2", role: "ADMIN", scopeAllCompanies: true, scopedCompanyIds: [] },
    ]);
    const dup = Object.assign(new Error("dup"), { code: "P2002" });
    Object.setPrototypeOf(dup, (await import("@prisma/client")).Prisma.PrismaClientKnownRequestError.prototype);
    notificationCreate.mockRejectedValueOnce(dup).mockResolvedValueOnce({ id: "n2" });

    expect(await alertOperators(alvo)).toBe(1); // só o segundo admin foi criado
  });
});

describe("trialAlertContent — o texto precisa gerar ação", () => {
  const base = {
    subscriptionId: "sub1",
    companyId: "co1",
    companyName: "Clínica Vida",
    trialEndsAt: new Date("2026-08-01T12:00:00Z"),
  };

  it("nomeia o cliente no título — alerta genérico não gera ligação", () => {
    const c = trialAlertContent({ ...base, daysLeft: 3 });
    expect(c.title).toContain("Clínica Vida");
    expect(c.title).toContain("em 3 dias");
  });

  it("usa 'amanhã' no singular, não 'em 1 dias'", () => {
    expect(trialAlertContent({ ...base, daysLeft: 1 }).title).toContain("amanhã");
  });

  it("no último dia diz 'hoje' e chama para a ação", () => {
    const c = trialAlertContent({ ...base, daysLeft: 0 });
    expect(c.title).toContain("hoje");
    expect(c.message).toContain("antes de perder a conversão");
  });
});
