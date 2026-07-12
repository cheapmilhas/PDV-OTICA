import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Prisma: mockado. user.findMany + $transaction + passwordResetToken. ---
const findMany = vi.fn();
const $transaction = vi.fn();
const deleteMany = vi.fn();
const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => findMany(...a) },
    $transaction: (...a: unknown[]) => $transaction(...a),
    passwordResetToken: {
      deleteMany: (...a: unknown[]) => deleteMany(...a),
      create: (...a: unknown[]) => create(...a),
    },
  },
}));

// --- E-mail: mockado (não queremos envio real). ---
const sendEmail = vi.fn();
vi.mock("@/lib/emails/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

// --- Logger: silenciado. ---
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// NÃO mockamos rate-limit nem o service: são puros/in-memory (comportamento real).
import { POST } from "./route";

const makeReq = (body: unknown, ip = "1.2.3.4") =>
  new Request("http://localhost/api/auth/esqueci-senha", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

/**
 * Executa o POST com fake timers avançando o piso de latência (1200ms), sem
 * deixar o teste travar 1.2s real. Avança em passos e cede o event loop para
 * que a Promise.all([trabalho, sleep]) resolva.
 */
async function callWithFloor(req: Request) {
  const promise = POST(req);
  // Avança o relógio virtual além do piso e cede ao microtask queue.
  await vi.advanceTimersByTimeAsync(1300);
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  findMany.mockReset();
  $transaction.mockReset();
  deleteMany.mockReset();
  create.mockReset();
  sendEmail.mockReset();
  // Padrão: transação e envio resolvem OK.
  $transaction.mockResolvedValue([{ count: 0 }, { id: "tok" }]);
  sendEmail.mockResolvedValue({ id: "email-1" });
  // Origem confiável para o link (fonte ÚNICA — nunca o Host da requisição).
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vis.app.br");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const GENERIC_MESSAGE =
  "Se houver uma conta com este e-mail, enviamos um link de recuperação.";

describe("POST /api/auth/esqueci-senha — anti-enumeração", () => {
  it("retorna 200 + corpo idêntico para conta existente e inexistente", async () => {
    // Conta existente (IP A, e-mail A para não colidir no rate-limit por e-mail)
    findMany.mockResolvedValueOnce([
      { id: "u1", email: "joao@x.com", company: { name: "Loja A" } },
    ]);
    const resExists = await callWithFloor(
      makeReq({ email: "joao@x.com" }, "10.0.0.1")
    );
    const bodyExists = await resExists.json();

    // Conta inexistente (IP B, e-mail B distintos)
    findMany.mockResolvedValueOnce([]);
    const resMissing = await callWithFloor(
      makeReq({ email: "ninguem@y.com" }, "10.0.0.2")
    );
    const bodyMissing = await resMissing.json();

    expect(resExists.status).toBe(200);
    expect(resMissing.status).toBe(200);
    expect(bodyExists).toEqual({ message: GENERIC_MESSAGE });
    expect(bodyMissing).toEqual({ message: GENERIC_MESSAGE });
    expect(bodyExists).toEqual(bodyMissing);
  });

  it("filtra logins internos (@login): sem token, sem e-mail, mas 200 genérico", async () => {
    findMany.mockResolvedValueOnce([
      { id: "u1", email: "joao@login", company: { name: "Loja A" } },
    ]);
    const res = await callWithFloor(makeReq({ email: "joao@login" }, "10.0.0.3"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: GENERIC_MESSAGE });
    expect($transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("N contas homônimas: 1 token por conta (2x), 1 e-mail com 1 destinatário", async () => {
    findMany.mockResolvedValueOnce([
      { id: "u1", email: "maria@x.com", company: { name: "Loja A" } },
      { id: "u2", email: "maria@x.com", company: { name: "Loja B" } },
    ]);
    const res = await callWithFloor(makeReq({ email: "maria@x.com" }, "10.0.0.4"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: GENERIC_MESSAGE });
    expect($transaction).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0] as { to: unknown };
    // 1 destinatário (string ou array de 1), não múltiplos.
    if (Array.isArray(arg.to)) {
      expect(arg.to).toHaveLength(1);
    } else {
      expect(arg.to).toBe("maria@x.com");
    }
  });

  it("sem NEXT_PUBLIC_APP_URL: não envia e-mail (anti reset-poisoning via Host)", async () => {
    // Fecha o vetor: a origem do link NÃO pode vir do Host da requisição. Sem
    // env confiável, nenhum link é montado e nenhum e-mail sai — resposta segue
    // idêntica (genérica 200), sem virar oráculo.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    findMany.mockResolvedValueOnce([
      { id: "u1", email: "joao@x.com", company: { name: "Loja A" } },
    ]);
    const res = await callWithFloor(makeReq({ email: "joao@x.com" }, "10.0.0.7"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: GENERIC_MESSAGE });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sempre 200: body sem email → genérico, sem token, sem e-mail", async () => {
    const res = await callWithFloor(makeReq({}, "10.0.0.5"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: GENERIC_MESSAGE });
    expect(findMany).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sempre 200: email malformado → genérico, sem token, sem e-mail", async () => {
    const res = await callWithFloor(
      makeReq({ email: "nao-e-email" }, "10.0.0.6")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: GENERIC_MESSAGE });
    expect(findMany).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("conta sintética COM recoveryEmail: token criado e link enviado ao recoveryEmail", async () => {
    findMany.mockResolvedValueOnce([
      { id: "u1", name: "Francisco", email: "francisco@login", recoveryEmail: "fs@gmail.com", company: { name: "Loja A" } },
    ]);
    const res = await callWithFloor(makeReq({ email: "fs@gmail.com" }, "10.9.0.1"));
    expect(res.status).toBe(200);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail.mock.calls[0][0] as { to: unknown }).to).toBe("fs@gmail.com");
  });

  it("conta sintética SEM recoveryEmail: nenhum token, nenhum envio, 200 genérico", async () => {
    findMany.mockResolvedValueOnce([
      { id: "u2", name: "Ada", email: "ada@login", recoveryEmail: null, company: { name: "Loja A" } },
    ]);
    const res = await callWithFloor(makeReq({ email: "ada@ninguem.com" }, "10.9.0.2"));
    expect(res.status).toBe(200);
    expect($transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("conta sintética com recoveryEmail VAZIO (dado legado): NÃO entregável, sem envio", async () => {
    // Robustez: a normalização grava vazio como null, mas importação/SQL manual
    // pode deixar "". O filtro usa .trim() truthy → "" não é destino válido.
    findMany.mockResolvedValueOnce([
      { id: "u9", name: "Zé", email: "ze@login", recoveryEmail: "", company: { name: "Loja A" } },
    ]);
    const res = await callWithFloor(makeReq({ email: "ze@ninguem.com" }, "10.9.0.9"));
    expect(res.status).toBe(200);
    expect($transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("label do botão mostra nome + loja, sem role", async () => {
    findMany.mockResolvedValueOnce([
      { id: "u3", name: "Leila", email: "leila@x.com", recoveryEmail: null, company: { name: "Atacadão" } },
    ]);
    await callWithFloor(makeReq({ email: "leila@x.com" }, "10.9.0.3"));
    const arg = sendEmail.mock.calls[0][0] as { html: string };
    expect(arg.html).toContain("Leila");
    expect(arg.html).toContain("Atacadão");
  });

  it("agrupamento: 2 contas com destinos distintos → um envio por destino", async () => {
    findMany.mockResolvedValueOnce([
      { id: "u4", name: "A", email: "a@x.com", recoveryEmail: null, company: { name: "L1" } },
      { id: "u5", name: "B", email: "b@login", recoveryEmail: "b@gmail.com", company: { name: "L2" } },
    ]);
    await callWithFloor(makeReq({ email: "a@x.com" }, "10.9.0.4"));
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const tos = sendEmail.mock.calls.map((c) => (c[0] as { to: string }).to).sort();
    expect(tos).toEqual(["a@x.com", "b@gmail.com"]);
  });
});
