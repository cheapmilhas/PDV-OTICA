import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Focus NFe client", () => {
  const ORIGINAL_ENV = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env = { ...ORIGINAL_ENV };
    process.env.FOCUS_NFE_TOKEN = "test_token_xyz";
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllGlobals();
  });

  describe("config detection", () => {
    it("usa URL homologação por default", async () => {
      delete process.env.FOCUS_NFE_ENV;
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "processando_autorizacao", ref: "x" }), { status: 200 }),
      );

      const { focusNfe } = await import("./focus-nfe");
      await focusNfe.status("x");

      expect(fetchMock.mock.calls[0][0]).toContain("homologacao.focusnfe.com.br");
    });

    it("usa URL produção quando FOCUS_NFE_ENV=producao", async () => {
      process.env.FOCUS_NFE_ENV = "producao";
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "autorizado", ref: "x" }), { status: 200 }),
      );

      const { focusNfe } = await import("./focus-nfe");
      await focusNfe.status("x");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("api.focusnfe.com.br");
      expect(url).not.toContain("homologacao");
    });

    it("lança erro sem FOCUS_NFE_TOKEN", async () => {
      delete process.env.FOCUS_NFE_TOKEN;
      const { focusNfe } = await import("./focus-nfe");
      await expect(focusNfe.status("x")).rejects.toThrow(/FOCUS_NFE_TOKEN/);
    });
  });

  describe("autenticação", () => {
    it("envia Basic Auth com token como username", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "autorizado", ref: "x" }), { status: 200 }),
      );
      const { focusNfe } = await import("./focus-nfe");
      await focusNfe.status("x");

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      const expected = `Basic ${Buffer.from("test_token_xyz:").toString("base64")}`;
      expect(headers["Authorization"]).toBe(expected);
    });
  });

  describe("emit", () => {
    const baseInput = {
      ref: "sale-abc",
      cnpj_emitente: "12345678000100",
      data_emissao: "2026-05-25T12:00:00-03:00",
      natureza_operacao: "VENDA",
      items: [
        {
          numero_item: 1,
          codigo_produto: "PROD1",
          descricao: "Lente",
          cfop: "5102",
          unidade_comercial: "UN",
          quantidade_comercial: 1,
          valor_unitario_comercial: 100,
          valor_unitario_tributavel: 100,
          unidade_tributavel: "UN",
          quantidade_tributavel: 1,
          codigo_ncm: "9001.40.00",
          icms_origem: "0",
          icms_situacao_tributaria: "102",
        },
      ],
      formas_pagamento: [{ forma_pagamento: "17", valor_pagamento: 100 }],
      valor_produtos: 100,
    };

    it("envia ref como query param", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "processando_autorizacao", ref: "sale-abc" }), { status: 200 }),
      );
      const { focusNfe } = await import("./focus-nfe");
      await focusNfe.emit(baseInput);

      expect(fetchMock.mock.calls[0][0]).toContain("ref=sale-abc");
    });

    it("envia POST com body JSON", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "processando_autorizacao", ref: "sale-abc" }), { status: 200 }),
      );
      const { focusNfe } = await import("./focus-nfe");
      await focusNfe.emit(baseInput);

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.ref).toBe("sale-abc");
      expect(body.items).toHaveLength(1);
    });

    it("lança FocusNfeError em erro SEFAZ", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ mensagem: "CFOP inválido", codigo_status: 234 }),
          { status: 400 },
        ),
      );
      const { focusNfe, FocusNfeError } = await import("./focus-nfe");
      await expect(focusNfe.emit(baseInput)).rejects.toThrow(FocusNfeError);
    });
  });

  describe("cancel", () => {
    it("rejeita justificativa menor que 15 caracteres", async () => {
      const { focusNfe } = await import("./focus-nfe");
      await expect(
        focusNfe.cancel("sale-abc", { justificativa: "curto" }),
      ).rejects.toThrow(/Justificativa/);
    });

    it("rejeita justificativa maior que 255 caracteres", async () => {
      const { focusNfe } = await import("./focus-nfe");
      const long = "a".repeat(256);
      await expect(
        focusNfe.cancel("sale-abc", { justificativa: long }),
      ).rejects.toThrow(/Justificativa/);
    });

    it("envia DELETE com justificativa", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "cancelado", ref: "sale-abc" }), { status: 200 }),
      );
      const { focusNfe } = await import("./focus-nfe");
      await focusNfe.cancel("sale-abc", { justificativa: "Cliente solicitou cancelamento da compra" });

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe("DELETE");
      expect(JSON.parse(init.body as string).justificativa).toContain("Cliente solicitou");
    });
  });

  describe("friendlyError", () => {
    it("mapeia código 539 para mensagem amigável", async () => {
      const { focusNfe } = await import("./focus-nfe");
      expect(focusNfe.friendlyError(539, "CNPJ ERROR")).toContain("CNPJ");
    });

    it("retorna mensagem original para código desconhecido", async () => {
      const { focusNfe } = await import("./focus-nfe");
      expect(focusNfe.friendlyError(9999, "Erro X")).toBe("Erro X");
    });

    it("fallback para mensagem indefinida", async () => {
      const { focusNfe } = await import("./focus-nfe");
      expect(focusNfe.friendlyError(undefined, undefined)).toContain("desconhecido");
    });
  });
});
