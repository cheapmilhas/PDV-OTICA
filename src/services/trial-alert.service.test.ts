/**
 * N5 — testes da lógica do alerta ao operador.
 *
 * Cada bloco trava um defeito que o challenge do Codex encontrou (2026-07-27).
 */
import { describe, it, expect } from "vitest";

import {
  trialAlertPeriodKey,
  trialAlertLink,
  trialAlertContent,
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
