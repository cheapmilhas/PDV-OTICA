import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  evolution,
  extractInstanceApiKey,
  mapEvolutionState,
  EVOLUTION_INTEGRATION,
} from "@/lib/evolution";

/**
 * Testa o client da Evolution com fetch mockado (sem rede / sem banco).
 * Foco: método/caminho corretos, header apikey, canal Baileys, qrcode:true,
 * webhook inline e o body ANINHADO do /webhook/set.
 */

const fetchMock = vi.fn();

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

describe("evolution client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    process.env.EVOLUTION_API_URL = "https://evo.test";
    process.env.EVOLUTION_API_KEY = "GLOBAL_KEY";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
  });

  it("createInstance: POST /instance/create com canal Baileys, qrcode e webhook inline", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        instance: { instanceName: "vis_co1", status: "connecting" },
        hash: "INSTANCE_KEY",
        qrcode: { base64: "data:image/png;base64,AAA", pairingCode: "WZYEH1YY" },
      }),
    );

    const res = await evolution.createInstance("vis_co1", {
      url: "https://app.test/api/webhooks/evolution",
      secret: "WHSECRET",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evo.test/instance/create");
    expect(init.method).toBe("POST");
    // header apikey é a chave global
    expect(init.headers.apikey).toBe("GLOBAL_KEY");

    const body = JSON.parse(init.body);
    expect(body.instanceName).toBe("vis_co1");
    expect(body.integration).toBe(EVOLUTION_INTEGRATION); // WHATSAPP-BAILEYS
    expect(body.integration).toBe("WHATSAPP-BAILEYS");
    expect(body.qrcode).toBe(true);
    // webhook inline com jwt_key e eventos de conexão
    expect(body.webhook.url).toBe("https://app.test/api/webhooks/evolution");
    expect(body.webhook.headers.jwt_key).toBe("WHSECRET");
    // QR/conexão (B1) + MESSAGES_UPSERT (B2: inbox + opt-out).
    expect(body.webhook.events).toEqual(["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"]);

    expect(res.qrcode?.base64).toBe("data:image/png;base64,AAA");
  });

  it("connect: GET /instance/connect/{instance}", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ base64: "data:image/png;base64,BBB", count: 1 }));

    const qr = await evolution.connect("vis_co1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evo.test/instance/connect/vis_co1");
    expect(init.method ?? "GET").toBe("GET");
    expect(qr.base64).toBe("data:image/png;base64,BBB");
  });

  it("connectionState: GET /instance/connectionState/{instance}", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ instance: { state: "open" } }));

    const res = await evolution.connectionState("vis_co1");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evo.test/instance/connectionState/vis_co1");
    expect(res.instance?.state).toBe("open");
  });

  it("logout: DELETE /instance/logout/{instance}", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ status: "SUCCESS" }));

    await evolution.logout("vis_co1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evo.test/instance/logout/vis_co1");
    expect(init.method).toBe("DELETE");
  });

  it("sendText: POST /message/sendText/{instance} com number+text e apikey", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ key: { id: "EVO_MSG_1" }, status: "PENDING" }));

    const res = await evolution.sendText("vis_co1", "5511999999999", "Olá!");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evo.test/message/sendText/vis_co1");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("GLOBAL_KEY");
    const body = JSON.parse(init.body);
    expect(body.number).toBe("5511999999999");
    expect(body.text).toBe("Olá!");
    expect(res.key?.id).toBe("EVO_MSG_1");
  });

  it("getMediaBase64: POST /chat/getBase64FromMediaMessage/{instance} com key.id e convertToMp4:false", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ base64: "QUFB", mimetype: "audio/ogg; codecs=opus", fileName: "audio.ogg" }),
    );

    const res = await evolution.getMediaBase64("vis_co1", "EVO_MSG_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evo.test/chat/getBase64FromMediaMessage/vis_co1");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("GLOBAL_KEY");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ message: { key: { id: "EVO_MSG_1" } }, convertToMp4: false });
    expect(res.base64).toBe("QUFB");
    expect(res.mimetype).toBe("audio/ogg; codecs=opus");
    expect(res.fileName).toBe("audio.ogg");
  });

  it("getMediaBase64: nome de instância com caracteres especiais é URL-encoded", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ base64: "QUFB" }));

    await evolution.getMediaBase64("vis co/1", "EVO_MSG_1");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evo.test/chat/getBase64FromMediaMessage/vis%20co%2F1");
  });

  it("setWebhook: POST /webhook/set/{instance} com body ANINHADO sob 'webhook'", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }));

    await evolution.setWebhook("vis_co1", {
      url: "https://app.test/api/webhooks/evolution",
      secret: "WHSECRET",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evo.test/webhook/set/vis_co1");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    // CRÍTICO: aninhado sob webhook (exigido pelo 2.3.x), não flat
    expect(body.webhook).toBeDefined();
    expect(body.url).toBeUndefined();
    expect(body.webhook.enabled).toBe(true);
    expect(body.webhook.headers.jwt_key).toBe("WHSECRET");
  });

  it("base URL com barra final não duplica '/'", async () => {
    process.env.EVOLUTION_API_URL = "https://evo.test/";
    fetchMock.mockResolvedValueOnce(okJson({ instance: { state: "close" } }));
    await evolution.connectionState("vis_co1");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evo.test/instance/connectionState/vis_co1");
  });

  it("lança quando faltam env vars", async () => {
    delete process.env.EVOLUTION_API_KEY;
    await expect(evolution.connectionState("vis_co1")).rejects.toThrow(/EVOLUTION_API_KEY/);
  });

  it("propaga erro HTTP da Evolution", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: "instance already exists" }),
    });
    await expect(evolution.createInstance("vis_co1", { url: "x", secret: "y" })).rejects.toThrow(
      /instance already exists/,
    );
  });

  it("extractInstanceApiKey: string ou objeto { apikey }", () => {
    expect(extractInstanceApiKey("STR")).toBe("STR");
    expect(extractInstanceApiKey({ apikey: "OBJ" })).toBe("OBJ");
    expect(extractInstanceApiKey(undefined)).toBeNull();
  });

  it("mapEvolutionState mapeia open/connecting/close", () => {
    expect(mapEvolutionState("open")).toBe("CONNECTED");
    expect(mapEvolutionState("connecting")).toBe("CONNECTING");
    expect(mapEvolutionState("close")).toBe("DISCONNECTED");
    expect(mapEvolutionState(undefined)).toBe("DISCONNECTED");
  });
});
