import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Prisma: mockado. findUnique + $transaction (com tx: updateMany/update/deleteMany/globalAudit). ---
const findUnique = vi.fn();
const txUpdateMany = vi.fn();
const txUserUpdate = vi.fn();
const txDeleteMany = vi.fn();
const txAuditCreate = vi.fn();
const $transaction = vi.fn(async (cb: (tx: unknown) => unknown) =>
  cb({
    passwordResetToken: {
      updateMany: (...a: unknown[]) => txUpdateMany(...a),
      deleteMany: (...a: unknown[]) => txDeleteMany(...a),
    },
    user: { update: (...a: unknown[]) => txUserUpdate(...a) },
    globalAudit: { create: (...a: unknown[]) => txAuditCreate(...a) },
  })
);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    passwordResetToken: { findUnique: (...a: unknown[]) => findUnique(...a) },
    $transaction: (cb: (tx: unknown) => unknown) => $transaction(cb),
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

// --- bcrypt: mockado (cost 12 é lento; hash determinístico para asserção). ---
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "$2b$12$hashfake"),
    compare: vi.fn(),
  },
}));

// Service real (puro): gera tokens válidos com selector/verifier/verifierHash coerentes.
import { generateTokenParts } from "@/services/password-reset.service";
import { POST } from "./route";

const VALID_PASSWORD = "senha-forte-123";

/** Monta uma request POST com IP customizável (evita colisão de rate-limit entre testes). */
const makeReq = (body: unknown, ip: string) =>
  new Request("http://localhost/api/auth/redefinir-senha", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

/** Row válido padrão: token não usado, não expirado, usuário entregável. */
function validRow(overrides: Record<string, unknown> = {}) {
  const { selector, verifier, verifierHash } = generateTokenParts();
  return {
    token: `${selector}.${verifier}`,
    row: {
      selector,
      verifierHash,
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
      userId: "u1",
      user: { id: "u1", email: "joao@x.com", companyId: "c1" },
      ...overrides,
    },
  };
}

let ipCounter = 0;
const nextIp = () => `10.9.0.${++ipCounter}`;

beforeEach(() => {
  findUnique.mockReset();
  txUpdateMany.mockReset();
  txUserUpdate.mockReset();
  txDeleteMany.mockReset();
  txAuditCreate.mockReset();
  $transaction.mockClear();
  sendEmail.mockReset();
  // Padrão: consumo ganha a corrida, updates/audit OK, e-mail OK.
  txUpdateMany.mockResolvedValue({ count: 1 });
  txUserUpdate.mockResolvedValue({ id: "u1" });
  txDeleteMany.mockResolvedValue({ count: 0 });
  txAuditCreate.mockResolvedValue({ id: "audit-1" });
  sendEmail.mockResolvedValue({ id: "email-1" });
});

describe("POST /api/auth/redefinir-senha", () => {
  it("token válido → senha trocada (200), user.update com hash+passwordChangedAt, deleteMany e audit chamados", async () => {
    const { token, row } = validRow();
    findUnique.mockResolvedValue(row);

    const res = await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, message: "Senha alterada com sucesso." });

    expect(txUserUpdate).toHaveBeenCalledTimes(1);
    const userArg = txUserUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: { passwordHash: string; passwordChangedAt: unknown };
    };
    expect(userArg.where.id).toBe("u1");
    expect(userArg.data.passwordHash).toBe("$2b$12$hashfake");
    expect(userArg.data.passwordChangedAt).toBeInstanceOf(Date);

    expect(txDeleteMany).toHaveBeenCalledTimes(1);
    expect(txAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("audit: actorId é null e metadata.userId === 'u1' (FK GlobalAudit.actorId → AdminUser)", async () => {
    const { token, row } = validRow();
    findUnique.mockResolvedValue(row);

    await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));

    expect(txAuditCreate).toHaveBeenCalledTimes(1);
    const auditArg = txAuditCreate.mock.calls[0][0] as {
      data: {
        actorType: string;
        actorId: unknown;
        companyId: string;
        action: string;
        metadata: { userId: string };
      };
    };
    expect(auditArg.data.actorId).toBeNull();
    expect(auditArg.data.actorType).toBe("USER");
    expect(auditArg.data.action).toBe("USER_PASSWORD_RESET_SELF");
    expect(auditArg.data.companyId).toBe("c1");
    expect(auditArg.data.metadata.userId).toBe("u1");
  });

  it("revoga demais tokens ativos do usuário: deleteMany chamado com where.userId === 'u1'", async () => {
    const { token, row } = validRow();
    findUnique.mockResolvedValue(row);

    await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));

    expect(txDeleteMany).toHaveBeenCalledTimes(1);
    const delArg = txDeleteMany.mock.calls[0][0] as { where: { userId: string } };
    expect(delArg.where.userId).toBe("u1");
  });

  it("verifier errado → 400 genérico, transação NÃO chamada", async () => {
    const { row } = validRow();
    findUnique.mockResolvedValue(row);
    // Token com verifier trocado — selector correto, verifier inválido.
    const badToken = `${row.selector}.verifier-errado`;

    const res = await POST(makeReq({ token: badToken, password: VALID_PASSWORD }, nextIp()));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Link inválido ou expirado" });
    expect($transaction).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("token expirado → 400 genérico, sem transação", async () => {
    const { token, row } = validRow({ expiresAt: new Date(Date.now() - 1000) });
    findUnique.mockResolvedValue(row);

    const res = await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Link inválido ou expirado" });
    expect($transaction).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("token já usado (usedAt != null) → 400 genérico, sem transação", async () => {
    const { token, row } = validRow({ usedAt: new Date() });
    findUnique.mockResolvedValue(row);

    const res = await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Link inválido ou expirado" });
    expect($transaction).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("token inexistente (findUnique null) → 400 genérico, sem transação", async () => {
    const { token } = validRow();
    findUnique.mockResolvedValue(null);

    const res = await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Link inválido ou expirado" });
    expect($transaction).not.toHaveBeenCalled();
  });

  it("consumo atômico (corrida perdida): updateMany retorna count:0 → 400, senha NÃO trocada", async () => {
    const { token, row } = validRow();
    findUnique.mockResolvedValue(row);
    txUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Link inválido ou expirado" });
    expect(txUpdateMany).toHaveBeenCalledTimes(1);
    expect(txUserUpdate).not.toHaveBeenCalled();
    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  it("senha < 8 caracteres → 400, sem findUnique", async () => {
    const { token } = validRow();

    const res = await POST(makeReq({ token, password: "curta" }, nextIp()));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Dados inválidos" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("senha > 72 caracteres → 400, sem findUnique", async () => {
    const { token } = validRow();

    const res = await POST(
      makeReq({ token, password: "a".repeat(73) }, nextIp())
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Dados inválidos" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("token malformado (sem ponto) → 400 genérico, sem findUnique", async () => {
    const res = await POST(
      makeReq({ token: "semponto", password: VALID_PASSWORD }, nextIp())
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Link inválido ou expirado" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("login interno (@login) → sucesso mas NÃO envia e-mail", async () => {
    const { token, row } = validRow({
      user: { id: "u1", email: "joao@login", companyId: "c1" },
    });
    findUnique.mockResolvedValue(row);

    const res = await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("e-mail entregável → envia e-mail 'senha alterada'", async () => {
    const { token, row } = validRow();
    findUnique.mockResolvedValue(row);

    await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0] as { to: string };
    expect(arg.to).toBe("joao@x.com");
  });

  it("falha no envio de e-mail NÃO derruba o sucesso (best-effort)", async () => {
    const { token, row } = validRow();
    findUnique.mockResolvedValue(row);
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await POST(makeReq({ token, password: VALID_PASSWORD }, nextIp()));
    expect(res.status).toBe(200);
  });
});
