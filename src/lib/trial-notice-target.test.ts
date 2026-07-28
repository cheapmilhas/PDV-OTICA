import { describe, expect, it } from "vitest";

import {
  MEDICAL_TRIAL_ENDING_TEMPLATE,
  MEDICAL_TRIAL_EXPIRED_TEMPLATE,
  resolveTrialNotice,
} from "@/lib/trial-notice-target";
import { renderEmailTemplate } from "@/lib/emails/templates";

const BASE = "https://app.vis.app.br";

describe("resolveTrialNotice", () => {
  it("mantém o CTA e o in-app do app Vis para a ótica", () => {
    const notice = resolveTrialNotice("VIS_APP", BASE);

    expect(notice.subscribeUrl).toBe(`${BASE}/dashboard/upgrade`);
    expect(notice.inappLink).toBe("/dashboard/upgrade");
    expect(notice.templateOverride).toBeNull();
  });

  it("não manda o cliente medical para nenhuma tela do Vis", () => {
    const notice = resolveTrialNotice("VIS_MEDICAL", BASE);

    // O defeito original: CTA para /dashboard/upgrade, tela que ele não acessa.
    expect(notice.subscribeUrl).toBeNull();
    expect(notice.templateOverride).toEqual({
      ending: MEDICAL_TRIAL_ENDING_TEMPLATE,
      expired: MEDICAL_TRIAL_EXPIRED_TEMPLATE,
    });
  });

  it("não cria notificação in-app para medical (ninguém a leria no Vis)", () => {
    expect(resolveTrialNotice("VIS_MEDICAL", BASE).inappLink).toBeNull();
  });

  it("falha alto num produto desconhecido em vez de tratá-lo como ótica", () => {
    // Fail-OPEN seria o erro caro aqui: um produto novo herdaria calado o CTA
    // do app Vis — que foi exatamente o defeito original com o medical.
    expect(() =>
      resolveTrialNotice("VIS_FUTURO" as never, BASE),
    ).toThrow(/Produto sem regra/);
  });
});

describe("templates medical de trial", () => {
  it("renderiza o aviso de fim de trial sem exigir subscribeUrl", () => {
    const { html, text } = renderEmailTemplate(MEDICAL_TRIAL_ENDING_TEMPLATE, {
      name: "Clínica MedFacil",
      daysLeft: 3,
    });

    expect(html).toContain("Clínica MedFacil");
    expect(html).toContain("3 dia(s)");
    expect(text).toContain("3 dia(s)");
  });

  it("renderiza o aviso de trial expirado sem exigir subscribeUrl", () => {
    const { html, text } = renderEmailTemplate(MEDICAL_TRIAL_EXPIRED_TEMPLATE, {
      name: "Clínica TESTE",
    });

    expect(html).toContain("Clínica TESTE");
    expect(text).toContain("terminou");
  });

  it("NÃO leva botão de assinatura nem link do app Vis", () => {
    const ending = renderEmailTemplate(MEDICAL_TRIAL_ENDING_TEMPLATE, {
      name: "Clínica",
      daysLeft: 1,
    });
    const expired = renderEmailTemplate(MEDICAL_TRIAL_EXPIRED_TEMPLATE, {
      name: "Clínica",
    });

    for (const { html, text } of [ending, expired]) {
      expect(html).not.toContain("/dashboard/upgrade");
      expect(html).not.toContain("Assinar agora");
      expect(text).not.toContain("/dashboard/upgrade");
    }
  });

  it("o template ÓTICO segue exigindo subscribeUrl (trava anti-regressão do CTA)", () => {
    // Se alguém tornar o campo opcional lá, este teste cai: é ele que impede
    // a ótica perder o botão "Assinar agora" numa mudança futura.
    expect(() =>
      renderEmailTemplate("saas-trial-ending", { name: "Ótica", daysLeft: 2 }),
    ).toThrow();
    expect(() =>
      renderEmailTemplate("saas-trial-expired", { name: "Ótica" }),
    ).toThrow();
  });
});
