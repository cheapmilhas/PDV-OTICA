import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

/**
 * Tests for POST /api/webhooks/evolution
 *
 * Foco: autenticação JWT (válido/ inválido / ausente / fail-closed em prod),
 * rejeição de instância desconhecida (isolamento) e atualização idempotente do
 * estado por evento.
 *
 * Estratégia: mock de prisma/rate-limit/logger. O JWT real é assinado com `jose`
 * (mesma lib do código) para exercitar a verificação de verdade.
 */

const whatsappFindUnique = vi.fn();
const whatsappUpdate = vi.fn();
const waConvUpsert = vi.fn();
const waMsgFind = vi.fn();
const waMsgCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConnection: {
      findUnique: (...a: unknown[]) => whatsappFindUnique(...a),
      update: (...a: unknown[]) => whatsappUpdate(...a),
    },
    whatsappConversation: {
      upsert: (...a: unknown[]) => waConvUpsert(...a),
    },
    whatsappMessage: {
      findUnique: (...a: unknown[]) => waMsgFind(...a),
      create: (...a: unknown[]) => waMsgCreate(...a),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitResponse: () => null,
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));

import { POST } from "./route";

const SECRET = "test-webhook-secret";

async function signValid(claims: Record<string, unknown> = {}) {
  const key = new TextEncoder().encode(SECRET);
  return new SignJWT({ app: "evolution", action: "webhook", ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}

function makeRequest(body: unknown, authHeader?: string) {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("https://app.test/api/webhooks/evolution", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/evolution", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    whatsappFindUnique.mockReset();
    whatsappUpdate.mockReset();
    waConvUpsert.mockReset();
    waMsgFind.mockReset();
    waMsgCreate.mockReset();
    vi.stubEnv("NODE_ENV", "test");
    process.env.EVOLUTION_WEBHOOK_SECRET = SECRET;
    delete process.env.ALLOW_UNSIGNED_EVOLUTION_WEBHOOK;
    whatsappFindUnique.mockResolvedValue({ id: "conn1", companyId: "co1", status: "CONNECTING" });
    whatsappUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejeita sem Authorization (401) quando o secret está setado", async () => {
    const req = makeRequest({ event: "connection.update", instance: "vis_co1", data: { state: "open" } });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(whatsappUpdate).not.toHaveBeenCalled();
  });

  it("rejeita JWT assinado com segredo errado (401)", async () => {
    const wrongKey = new TextEncoder().encode("outro-segredo");
    const token = await new SignJWT({ app: "evolution", action: "webhook" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(wrongKey);
    const req = makeRequest(
      { event: "connection.update", instance: "vis_co1", data: { state: "open" } },
      `Bearer ${token}`,
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejeita JWT com claims erradas (401)", async () => {
    const token = await signValid({ app: "outro-app" });
    const req = makeRequest(
      { event: "connection.update", instance: "vis_co1", data: { state: "open" } },
      `Bearer ${token}`,
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("fail-closed em produção quando o secret está ausente (401)", async () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    vi.stubEnv("NODE_ENV", "production");
    const req = makeRequest({ event: "connection.update", instance: "vis_co1", data: { state: "open" } });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("escape hatch ALLOW_UNSIGNED em prod permite sem JWT", async () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_UNSIGNED_EVOLUTION_WEBHOOK = "1";
    const req = makeRequest({ event: "connection.update", instance: "vis_co1", data: { state: "open" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("ISOLAMENTO: instância desconhecida → 404 e nenhuma escrita", async () => {
    whatsappFindUnique.mockResolvedValueOnce(null);
    const token = await signValid();
    const req = makeRequest(
      { event: "connection.update", instance: "vis_desconhecida", data: { state: "open" } },
      `Bearer ${token}`,
    );
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(whatsappUpdate).not.toHaveBeenCalled();
  });

  it("connection.update state=open marca CONNECTED com o número do sender", async () => {
    const token = await signValid();
    const req = makeRequest(
      {
        event: "connection.update",
        instance: "vis_co1",
        data: { state: "open" },
        sender: "5511999999999@s.whatsapp.net",
      },
      `Bearer ${token}`,
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(whatsappUpdate).toHaveBeenCalledTimes(1);
    const arg = whatsappUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "conn1" });
    expect(arg.data.status).toBe("CONNECTED");
    expect(arg.data.connectedNumber).toBe("5511999999999");
  });

  it("connection.update state=close marca DISCONNECTED", async () => {
    const token = await signValid();
    const req = makeRequest(
      { event: "connection.update", instance: "vis_co1", data: { state: "close" } },
      `Bearer ${token}`,
    );
    await POST(req);
    const arg = whatsappUpdate.mock.calls[0][0];
    expect(arg.data.status).toBe("DISCONNECTED");
  });

  it("qrcode.updated marca CONNECTING e lastQrAt", async () => {
    const token = await signValid();
    const req = makeRequest(
      { event: "qrcode.updated", instance: "vis_co1", data: {} },
      `Bearer ${token}`,
    );
    await POST(req);
    const arg = whatsappUpdate.mock.calls[0][0];
    expect(arg.data.status).toBe("CONNECTING");
    expect(arg.data.lastQrAt).toBeInstanceOf(Date);
  });

  it("payload malformado (sem event/instance) → 400", async () => {
    const token = await signValid();
    const req = makeRequest({ foo: "bar" }, `Bearer ${token}`);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("idempotência: dois open seguidos produzem a mesma escrita (sem efeito colateral acumulado)", async () => {
    const token = await signValid();
    const body = {
      event: "connection.update",
      instance: "vis_co1",
      data: { state: "open" },
      sender: "5511999999999@s.whatsapp.net",
    };
    await POST(makeRequest(body, `Bearer ${token}`));
    await POST(makeRequest(body, `Bearer ${await signValid()}`));
    expect(whatsappUpdate).toHaveBeenCalledTimes(2);
    const a = whatsappUpdate.mock.calls[0][0].data;
    const b = whatsappUpdate.mock.calls[1][0].data;
    expect(a.status).toBe(b.status);
    expect(a.connectedNumber).toBe(b.connectedNumber);
  });

  it("messages.upsert inbound persiste a mensagem (200)", async () => {
    waMsgFind.mockResolvedValue(null);
    waConvUpsert.mockResolvedValue({ id: "conv1" });
    waMsgCreate.mockResolvedValue({ id: "m1" });

    const token = await signValid();
    const req = makeRequest(
      {
        event: "messages.upsert",
        instance: "vis_co1",
        data: {
          key: { id: "WAMID1", remoteJid: "5585999@s.whatsapp.net", fromMe: false },
          pushName: "Maria",
          message: { conversation: "tem óculos de grau?" },
          messageTimestamp: 1750000000,
        },
      },
      `Bearer ${token}`,
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(waMsgCreate).toHaveBeenCalled();
  });

  it("messages.upsert fromMe (outbound) é ignorado mas responde 200", async () => {
    const token = await signValid();
    const req = makeRequest(
      {
        event: "messages.upsert",
        instance: "vis_co1",
        data: {
          key: { id: "X", remoteJid: "5585@s.whatsapp.net", fromMe: true },
          message: { conversation: "resposta" },
        },
      },
      `Bearer ${token}`,
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(waMsgCreate).not.toHaveBeenCalled();
  });
});
