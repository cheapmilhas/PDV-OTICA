import { describe, it, expect } from "vitest";
import { ZodError, z } from "zod";
import { Prisma } from "@prisma/client";
import { handleApiError, AppError, ERROR_CODES, businessRuleError } from "./error-handler";

async function body(res: Response) {
  return (await res.json()) as { error: { code: string; message: string; errorId?: string } };
}

describe("handleApiError — errorId de correlação (Fase 4)", () => {
  it("erro inesperado (Error genérico) → 500 COM errorId no formato err_xxxxxxxx", async () => {
    const res = handleApiError(new Error("boom"));
    expect(res.status).toBe(500);
    const b = await body(res);
    expect(b.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(b.error.errorId).toMatch(/^err_[a-f0-9]{8}$/);
  });

  it("erro desconhecido (não-Error) → 500 COM errorId", async () => {
    const res = handleApiError("string solta");
    expect(res.status).toBe(500);
    const b = await body(res);
    expect(b.error.errorId).toMatch(/^err_[a-f0-9]{8}$/);
  });

  it("cada erro recebe um errorId DIFERENTE", async () => {
    const a = await body(handleApiError(new Error("x")));
    const b = await body(handleApiError(new Error("y")));
    expect(a.error.errorId).not.toBe(b.error.errorId);
  });

  it("erro de Prisma desconhecido (5xx) → COM errorId", async () => {
    const prismaErr = new Prisma.PrismaClientKnownRequestError("pool timeout", {
      code: "P2024",
      clientVersion: "5.22.0",
    });
    const res = handleApiError(prismaErr);
    expect(res.status).toBe(500);
    const b = await body(res);
    expect(b.error.code).toBe(ERROR_CODES.DATABASE_ERROR);
    expect(b.error.errorId).toMatch(/^err_[a-f0-9]{8}$/);
  });

  it("erro ESPERADO (regra de negócio, 400) → SEM errorId (não precisa rastreio)", async () => {
    const res = handleApiError(businessRuleError("saldo insuficiente"));
    expect(res.status).toBe(400);
    const b = await body(res);
    expect(b.error.errorId).toBeUndefined();
  });

  it("AppError customizado preserva código e statusCode, sem errorId", async () => {
    const res = handleApiError(new AppError(ERROR_CODES.FORBIDDEN, "sem permissão", 403));
    expect(res.status).toBe(403);
    const b = await body(res);
    expect(b.error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(b.error.errorId).toBeUndefined();
  });

  it("ZodError → 400 de validação, sem errorId", async () => {
    let zerr: ZodError;
    try {
      z.object({ age: z.number() }).parse({ age: "x" });
      throw new Error("deveria ter lançado");
    } catch (e) {
      zerr = e as ZodError;
    }
    const res = handleApiError(zerr);
    expect(res.status).toBe(400);
    const b = await body(res);
    expect(b.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(b.error.errorId).toBeUndefined();
  });
});
