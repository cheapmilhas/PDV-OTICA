import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Asaas client", () => {
  const ORIGINAL_ENV = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllGlobals();
  });

  describe("config detection", () => {
    it("usa URL sandbox para chaves $aact_test_*", async () => {
      process.env.ASAAS_API_KEY = "$aact_test_abc123";
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "cus_1", name: "x", email: "e@e.com", cpfCnpj: "1" }), { status: 200 }),
      );

      const { asaas } = await import("./asaas");
      await asaas.customers.get("cus_1");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("api-sandbox.asaas.com");
    });

    it("usa URL produção para chaves $aact_prod_*", async () => {
      process.env.ASAAS_API_KEY = "$aact_prod_xyz789";
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "cus_1", name: "x", email: "e@e.com", cpfCnpj: "1" }), { status: 200 }),
      );

      const { asaas } = await import("./asaas");
      await asaas.customers.get("cus_1");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("api.asaas.com");
      expect(url).not.toContain("sandbox");
    });

    it("respeita ASAAS_API_URL custom override", async () => {
      process.env.ASAAS_API_KEY = "$aact_test_abc";
      process.env.ASAAS_API_URL = "https://custom.example.com/v3";
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "cus_1", name: "x", email: "e@e.com", cpfCnpj: "1" }), { status: 200 }),
      );

      const { asaas } = await import("./asaas");
      await asaas.customers.get("cus_1");

      expect(fetchMock.mock.calls[0][0]).toContain("custom.example.com");
    });

    it("lança erro sem ASAAS_API_KEY", async () => {
      delete process.env.ASAAS_API_KEY;
      const { asaas } = await import("./asaas");
      await expect(asaas.customers.get("cus_1")).rejects.toThrow(/ASAAS_API_KEY/);
    });
  });

  describe("requests", () => {
    beforeEach(() => {
      process.env.ASAAS_API_KEY = "$aact_test_abc";
    });

    it("envia header access_token", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "x", name: "x", email: "e", cpfCnpj: "1" }), { status: 200 }),
      );
      const { asaas } = await import("./asaas");
      await asaas.customers.get("x");

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers["access_token"]).toBe("$aact_test_abc");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("envia idempotency-key em subscriptions.create", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "sub_1", customer: "c", status: "ACTIVE", nextDueDate: "2026-01-01", value: 100, cycle: "MONTHLY", billingType: "PIX" }), { status: 200 }),
      );
      const { asaas } = await import("./asaas");
      await asaas.subscriptions.create({
        customer: "c1",
        billingType: "PIX",
        nextDueDate: "2026-01-01",
        value: 100,
        cycle: "MONTHLY",
        externalReference: "company:abc:plan:xyz",
      });

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers["asaas-idempotency-key"]).toBe("company:abc:plan:xyz");
    });

    it("lança AsaasError com descrição na resposta de erro", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ errors: [{ description: "CPF inválido" }] }),
          { status: 400 },
        ),
      );
      const { asaas, AsaasError } = await import("./asaas");
      await expect(asaas.customers.get("x")).rejects.toThrow(AsaasError);
    });
  });

  describe("payments.list / create", () => {
    beforeEach(() => {
      process.env.ASAAS_API_KEY = "$aact_test_abc";
    });

    it("payments.list monta query e parseia a resposta", async () => {
      const body = {
        data: [{ id: "pay_1", value: 149.9, status: "PENDING" }],
        totalCount: 1,
        hasMore: false,
        limit: 100,
        offset: 0,
      };
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(body), { status: 200 }),
      );

      const { asaas } = await import("./asaas");
      const res = await asaas.payments.list({
        subscription: "sub_1",
        status: "PENDING",
        offset: 0,
        limit: 100,
      });

      expect(res.data).toHaveLength(1);
      expect(res.hasMore).toBe(false);
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/payments?");
      expect(calledUrl).toContain("subscription=sub_1");
      expect(calledUrl).toContain("status=PENDING");
      expect(calledUrl).toContain("limit=100");
      expect(calledUrl).toContain("offset=0");
    });

    it("payments.list aplica defaults de limit/offset", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [], totalCount: 0, hasMore: false, limit: 100, offset: 0 }),
          { status: 200 },
        ),
      );

      const { asaas } = await import("./asaas");
      await asaas.payments.list({ subscription: "sub_1" });

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("limit=100");
      expect(calledUrl).toContain("offset=0");
    });

    it("payments.create faz POST com body e idempotencyKey", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "pay_2", value: 149.9, status: "PENDING" }),
          { status: 200 },
        ),
      );

      const { asaas } = await import("./asaas");
      await asaas.payments.create(
        { customer: "cus_1", billingType: "BOLETO", value: 149.9, dueDate: "2026-07-10" },
        "idem-1",
      );

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toMatchObject({
        customer: "cus_1",
        billingType: "BOLETO",
        value: 149.9,
      });
      const headers = init.headers as Record<string, string>;
      expect(headers["asaas-idempotency-key"]).toBe("idem-1");
    });
  });

  describe("customers.update", () => {
    it("usa PUT em /customers/{id} com o body (Asaas exige PUT, não POST)", async () => {
      process.env.ASAAS_API_KEY = "$aact_test_abc";
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "cus_1", notificationDisabled: true }), { status: 200 }),
      );

      const { asaas } = await import("./asaas");
      await asaas.customers.update("cus_1", { notificationDisabled: true });

      const url = fetchMock.mock.calls[0][0] as string;
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(url).toContain("/customers/cus_1");
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body as string)).toEqual({ notificationDisabled: true });
    });
  });

  describe("verifyWebhookToken", () => {
    it("retorna false sem ASAAS_WEBHOOK_TOKEN configurado", async () => {
      delete process.env.ASAAS_WEBHOOK_TOKEN;
      const { asaas } = await import("./asaas");
      expect(asaas.verifyWebhookToken("qualquer")).toBe(false);
    });

    it("retorna false para token nulo", async () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo";
      process.env.ASAAS_API_KEY = "$aact_test_abc";
      const { asaas } = await import("./asaas");
      expect(asaas.verifyWebhookToken(null)).toBe(false);
    });

    it("retorna false para token errado", async () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo";
      process.env.ASAAS_API_KEY = "$aact_test_abc";
      const { asaas } = await import("./asaas");
      expect(asaas.verifyWebhookToken("errado!")).toBe(false);
    });

    it("retorna false para token de tamanho diferente", async () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo";
      process.env.ASAAS_API_KEY = "$aact_test_abc";
      const { asaas } = await import("./asaas");
      expect(asaas.verifyWebhookToken("segr")).toBe(false);
      expect(asaas.verifyWebhookToken("segredo!")).toBe(false);
    });

    it("retorna true para token correto", async () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo";
      process.env.ASAAS_API_KEY = "$aact_test_abc";
      const { asaas } = await import("./asaas");
      expect(asaas.verifyWebhookToken("segredo")).toBe(true);
    });
  });
});
