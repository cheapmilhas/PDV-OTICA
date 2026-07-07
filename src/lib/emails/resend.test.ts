import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A config do Resend agora vem do banco (chave cifrada editável pela UI) com
// fallback p/ env. Nestes testes o singleton está VAZIO → cai no fallback env,
// mantendo o comportamento histórico (env-only).
vi.mock("@/lib/prisma", () => ({
  prisma: { saasEmailConfig: { findUnique: vi.fn().mockResolvedValue(null) } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

describe("Resend email client", () => {
  const ORIGINAL_ENV = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env = { ...ORIGINAL_ENV };
    process.env.RESEND_API_KEY = "re_test_123";
    process.env.EMAIL_FROM = "PDV Otica <noreply@example.com>";
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllGlobals();
  });

  it("envia POST /emails com Authorization e payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email_123" }), { status: 200 })
    );

    const { sendEmail } = await import("./resend");
    const result = await sendEmail({
      to: "cliente@example.com",
      subject: "Bem-vindo",
      html: "<p>oi</p>",
      text: "oi",
      idempotencyKey: "email-queue/abc",
    });

    expect(result.id).toBe("email_123");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_123");
    expect(headers["Idempotency-Key"]).toBe("email-queue/abc");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("PDV Otica <noreply@example.com>");
    expect(body.to).toBe("cliente@example.com");
    expect(body.subject).toBe("Bem-vindo");
    expect(body.html).toBe("<p>oi</p>");
  });

  it("respeita RESEND_API_URL custom", async () => {
    process.env.RESEND_API_URL = "https://resend.test";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email_123" }), { status: 200 })
    );

    const { sendEmail } = await import("./resend");
    await sendEmail({ to: "a@b.com", subject: "x", html: "<p>x</p>" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://resend.test/emails");
  });

  it("lança erro sem chave (nem no banco nem em RESEND_API_KEY)", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import("./resend");
    await expect(sendEmail({ to: "a@b.com", subject: "x", html: "<p>x</p>" })).rejects.toThrow(
      /Chave Resend ausente/
    );
  });

  it("lança ResendError quando API retorna erro", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 })
    );

    const { sendEmail, ResendError } = await import("./resend");
    await expect(sendEmail({ to: "a@b.com", subject: "x", html: "<p>x</p>" })).rejects.toThrow(
      ResendError
    );
  });
});
