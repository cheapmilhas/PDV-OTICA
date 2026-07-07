import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    saasEmailConfig: {
      upsert: (...a: unknown[]) => upsert(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
// Cifra determinística e reversível para o teste (não exercita crypto real).
vi.mock("@/lib/secret-cipher", () => ({
  encryptSecret: (p: string) => `enc(${p})`,
  decryptSecret: (c: string) => {
    const m = /^enc\((.*)\)$/.exec(c);
    if (!m) throw new Error("ciphertext inválido");
    return m[1];
  },
}));

import {
  getSaasEmailConfig,
  updateSaasEmailConfig,
  getSaasEmailSenderView,
  updateSaasEmailSender,
  getResendConfig,
} from "./saas-email-config.service";

describe("saas-email-config.service", () => {
  beforeEach(() => {
    upsert.mockReset();
    findUnique.mockReset();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;
  });

  it("getSaasEmailConfig faz upsert do singleton e retorna o registro", async () => {
    upsert.mockResolvedValue({ id: "singleton", masterEnabled: true, testMode: true });
    const cfg = await getSaasEmailConfig();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "singleton" }, create: { id: "singleton" } })
    );
    expect(cfg.testMode).toBe(true);
  });

  it("updateSaasEmailConfig aplica o patch e registra updatedBy", async () => {
    upsert.mockResolvedValue({ id: "singleton", testMode: false });
    await updateSaasEmailConfig({ testMode: false }, "admin-1");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "singleton" },
        update: { testMode: false, updatedBy: "admin-1" },
      })
    );
  });

  // ── Remetente + chave Resend ─────────────────────────────────────────────────

  describe("getSaasEmailSenderView", () => {
    it("expõe hasResendKey booleano e NUNCA a chave", async () => {
      upsert.mockResolvedValue({ resendApiKeyEnc: "enc(re_abc)", emailFrom: "x@y.com", emailReplyTo: null });
      const v = await getSaasEmailSenderView();
      expect(v).toEqual({ hasResendKey: true, emailFrom: "x@y.com", emailReplyTo: null });
      expect(JSON.stringify(v)).not.toContain("enc(");
      expect(JSON.stringify(v)).not.toContain("re_abc");
    });

    it("hasResendKey false quando não há chave", async () => {
      upsert.mockResolvedValue({ resendApiKeyEnc: null, emailFrom: null, emailReplyTo: null });
      expect((await getSaasEmailSenderView()).hasResendKey).toBe(false);
    });
  });

  describe("updateSaasEmailSender", () => {
    it("cifra a chave quando vem não-vazia (com trim)", async () => {
      upsert.mockResolvedValue({});
      await updateSaasEmailSender({ resendApiKey: "  re_secret  " }, "admin1");
      const data = upsert.mock.calls[0][0].update;
      expect(data.resendApiKeyEnc).toBe("enc(re_secret)");
      expect(data.updatedBy).toBe("admin1");
    });

    it("chave em branco MANTÉM a atual (não entra no update)", async () => {
      upsert.mockResolvedValue({});
      await updateSaasEmailSender({ resendApiKey: "   " }, "admin1");
      expect("resendApiKeyEnc" in upsert.mock.calls[0][0].update).toBe(false);
    });

    it("emailFrom definido grava; emailReplyTo vazio limpa (null)", async () => {
      upsert.mockResolvedValue({});
      await updateSaasEmailSender({ emailFrom: "  novo@vis.app.br  ", emailReplyTo: "" });
      const data = upsert.mock.calls[0][0].update;
      expect(data.emailFrom).toBe("novo@vis.app.br");
      expect(data.emailReplyTo).toBeNull();
      expect("resendApiKeyEnc" in data).toBe(false);
    });
  });

  describe("getResendConfig", () => {
    it("banco tem prioridade: decifra a chave e usa from do banco", async () => {
      findUnique.mockResolvedValue({ resendApiKeyEnc: "enc(re_db)", emailFrom: "db@vis.app.br", emailReplyTo: "reply@vis.app.br" });
      process.env.RESEND_API_KEY = "re_env";
      const c = await getResendConfig();
      expect(c.apiKey).toBe("re_db");
      expect(c.from).toBe("db@vis.app.br");
      expect(c.replyTo).toBe("reply@vis.app.br");
      expect(c.baseUrl).toBe("https://api.resend.com");
    });

    it("banco vazio: cai no fallback env", async () => {
      findUnique.mockResolvedValue(null);
      process.env.RESEND_API_KEY = "re_env";
      process.env.EMAIL_FROM = "env@vis.app.br";
      const c = await getResendConfig();
      expect(c.apiKey).toBe("re_env");
      expect(c.from).toBe("env@vis.app.br");
    });

    it("chave corrompida no banco: cai no env (não quebra)", async () => {
      findUnique.mockResolvedValue({ resendApiKeyEnc: "LIXO", emailFrom: null, emailReplyTo: null });
      process.env.RESEND_API_KEY = "re_env";
      process.env.EMAIL_FROM = "env@vis.app.br";
      expect((await getResendConfig()).apiKey).toBe("re_env");
    });

    it("lança se falta chave em banco E env", async () => {
      findUnique.mockResolvedValue(null);
      process.env.EMAIL_FROM = "env@vis.app.br";
      await expect(getResendConfig()).rejects.toThrow(/Chave Resend ausente/);
    });

    it("lança se falta remetente em banco E env", async () => {
      findUnique.mockResolvedValue(null);
      process.env.RESEND_API_KEY = "re_env";
      await expect(getResendConfig()).rejects.toThrow(/Remetente ausente/);
    });
  });
});
