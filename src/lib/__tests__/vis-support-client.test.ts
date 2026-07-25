import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { postSupportRedeem } from "../vis-support-client";

/**
 * F3.6 — cliente do canal de RESGATE (Vis → Domus).
 *
 * O que estes testes protegem: a CLASSIFICAÇÃO da resposta. O código de
 * autorização do cliente é single-use, então errar a classe de falha tem custo
 * real e assimétrico:
 *  - chamar de "transitório" algo que já consumiu o código → a UI manda retentar
 *    e o operador queima tentativas num código morto;
 *  - chamar de "rejeitado" algo que não consumiu nada → pedimos ao cliente um
 *    código novo à toa;
 *  - responder "ok" sem magicUrl → a UI diz "autorizado" com link vazio.
 */

const ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  process.env.VIS_DOMUS_SUPPORT_SECRET = "sekret";
  process.env.DOMUS_WEBHOOK_URL = "https://domus.example";
});

afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

const REQ = {
  code: "ABCDE-FGHIJ",
  clinicId: "11111111-1111-1111-1111-111111111111",
  supportGrantId: "22222222-2222-2222-2222-222222222222",
  visOperatorRef: "vis-op-abc",
};

function mockJson(status: number, body: unknown) {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("postSupportRedeem — config e canal", () => {
  it("sem secret → transient, e NÃO toca a rede", async () => {
    delete process.env.VIS_DOMUS_SUPPORT_SECRET;
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("transient");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sem url → transient, e NÃO toca a rede", async () => {
    delete process.env.DOMUS_WEBHOOK_URL;
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("transient");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falha de rede → transient (nada foi consumido, pode retentar)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ECONNRESET"),
    );
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("transient");
    if (r.kind === "transient") expect(r.reason).toContain("ECONNRESET");
  });

  it("assina com path próprio do endpoint de suporte e manda os 3 headers", async () => {
    mockJson(200, { ok: true, grantId: "g1", magicUrl: "https://d/suporte/ativar#t=x" });
    await postSupportRedeem(REQ);

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://domus.example/api/internal/vis/support/redeem");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-vis-signature"]).toBeTruthy();
    expect(headers["x-vis-nonce"]).toBeTruthy();
    expect(headers["x-vis-timestamp"]).toBeTruthy();
  });

  it("envia clinicId no corpo — o Domus rejeita 400 sem ele", async () => {
    mockJson(200, { ok: true, grantId: "g1", magicUrl: "https://d/x#t=y" });
    await postSupportRedeem(REQ);

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.clinicId).toBe(REQ.clinicId);
    expect(body.supportGrantId).toBe(REQ.supportGrantId);
    expect(body.visOperatorRef).toBe(REQ.visOperatorRef);
    expect(body.code).toBe(REQ.code);
  });

  it("nonce é novo a cada chamada (senão o 2º request bate no anti-replay)", async () => {
    mockJson(200, { ok: true, grantId: "g1", magicUrl: "https://d/x#t=y" });
    await postSupportRedeem(REQ);
    await postSupportRedeem(REQ);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const n1 = ((calls[0][1] as RequestInit).headers as Record<string, string>)["x-vis-nonce"];
    const n2 = ((calls[1][1] as RequestInit).headers as Record<string, string>)["x-vis-nonce"];
    expect(n1).not.toBe(n2);
  });
});

describe("postSupportRedeem — classificação da resposta", () => {
  it("200 com magicUrl → ok (repassa grantId e expiresAt)", async () => {
    mockJson(200, {
      ok: true,
      grantId: "g-123",
      magicUrl: "https://domus.example/suporte/ativar#t=tok",
      expiresAt: "2026-07-25T13:00:00.000Z",
    });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.magicUrl).toContain("#t=tok");
      expect(r.grantId).toBe("g-123");
      expect(r.expiresAt).toBe("2026-07-25T13:00:00.000Z");
    }
  });

  it("200 SEM magicUrl → activation_unavailable, nunca ok", async () => {
    // Blindagem: um 200 sem link deixaria a UI dizendo "autorizado" com link
    // vazio, e o código do cliente já teria sido queimado.
    mockJson(200, { ok: true, grantId: "g-777" });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("activation_unavailable");
    if (r.kind === "activation_unavailable") expect(r.grantId).toBe("g-777");
  });

  it("500 activation_unavailable → classe própria (código JÁ consumido)", async () => {
    // NÃO pode virar transient: retentar o mesmo código daria 409, e pedir outro
    // ao cliente é desnecessário — o grant existe e é reemitível.
    mockJson(500, { error: "activation_unavailable", grantId: "g-999" });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("activation_unavailable");
    if (r.kind === "activation_unavailable") expect(r.grantId).toBe("g-999");
  });

  it("200 com magicUrl RELATIVO → activation_unavailable (não abre no domínio Vis)", async () => {
    // Se o BETTER_AUTH_URL não estiver setado, o Domus devolve "/suporte/ativar#t=..".
    // Abrir isso no super admin daria 404 com o código do cliente já queimado.
    mockJson(200, { ok: true, grantId: "g-rel", magicUrl: "/suporte/ativar#t=tok" });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("activation_unavailable");
    if (r.kind === "activation_unavailable") expect(r.grantId).toBe("g-rel");
  });

  it("200 com magicUrl de esquema não-http → activation_unavailable", async () => {
    mockJson(200, { ok: true, grantId: "g-x", magicUrl: "javascript:alert(1)" });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("activation_unavailable");
  });

  it("500 genérico (sem o marcador) → transient, não activation_unavailable", async () => {
    mockJson(500, { error: "boom" });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("transient");
  });

  it("503 activation_unavailable (F3.7) → transient: a tx reverteu, código intacto", async () => {
    // Desde a F3.7 a emissão do token vive na MESMA transação do resgate. Se ela
    // falha, tudo reverte e o código do cliente NÃO foi gasto — logo é
    // retentável, e classificar como rejeição mandaria pedir código novo à toa.
    mockJson(503, { error: "activation_unavailable" });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("transient");
  });

  it("503 not_enabled → transient (fail-closed, sem efeito colateral)", async () => {
    // O Domus checa a flag ANTES de consumir qualquer coisa: o código do cliente
    // segue válido, então é retentável — não é rejeição.
    mockJson(503, { error: "not_enabled" });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("transient");
    if (r.kind === "transient") expect(r.reason).toBe("not_enabled");
  });

  it.each([
    [400, "invalid_payload"],
    [401, "unauthorized"],
    [403, "host_not_allowed"],
    [409, "already_used"],
    [413, "payload_too_large"],
    [422, "unprocessable"],
    [429, "rate_limited"],
  ])("%i → rejected (definitivo)", async (status, error) => {
    mockJson(status, { error });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("rejected");
    if (r.kind === "rejected") {
      expect(r.status).toBe(status);
      expect(r.error).toBe(error);
    }
  });

  it("corpo não-JSON não quebra a classificação", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => {
        throw new Error("not json");
      },
    });
    const r = await postSupportRedeem(REQ);
    expect(r.kind).toBe("rejected");
    if (r.kind === "rejected") expect(r.error).toBe("rejected");
  });
});
