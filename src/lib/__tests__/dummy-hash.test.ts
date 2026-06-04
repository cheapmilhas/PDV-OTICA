import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Q8.4 regression: o DUMMY_HASH em src/auth.ts DEVE ser um hash bcrypt VÁLIDO.
 * Um valor malformado faz bcrypt.compare retornar em ~0ms (curto-circuito), o
 * que ANULA a defesa contra enumeração de emails por timing. Este teste extrai
 * a constante do arquivo e prova que é um bcrypt real (60 chars, prefixo $2).
 */
describe("DUMMY_HASH (defesa de timing no login)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/auth.ts"),
    "utf8"
  );
  const match = src.match(/DUMMY_HASH\s*=\s*["'`]([^"'`]+)["'`]/);
  const hash = match?.[1] ?? "";

  it("está presente no auth.ts", () => {
    expect(hash).not.toBe("");
  });

  it("tem o formato de um bcrypt hash válido (60 chars, prefixo $2)", () => {
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    expect(hash.length).toBe(60);
  });

  it("bcrypt.compare contra ele NÃO curto-circuita (faz trabalho real)", async () => {
    // Hash válido → compare resolve para false com trabalho cripto real.
    // (Não medimos ms aqui p/ evitar flakiness; o formato válido já garante
    // que o bcrypt não rejeita por tamanho/prefixo.)
    const result = await bcrypt.compare("qualquer-senha", hash);
    expect(result).toBe(false);
  });
});
