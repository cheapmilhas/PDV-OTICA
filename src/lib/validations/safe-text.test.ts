import { describe, it, expect } from "vitest";
import { containsHtml, safeName, safeFreeText } from "./safe-text";

// Payload real capturado no banco (Company.name), abreviado.
const ATTACK_PAYLOAD =
  "<!DOCTYPE html> <html lang='pt'> <head> <style> .overlay { position: fixed; z-index: 999999; } </style> </head> <body> Site perigoso </body> </html>";

describe("containsHtml", () => {
  it("detecta o payload de XSS/clickjacking armazenado", () => {
    expect(containsHtml(ATTACK_PAYLOAD)).toBe(true);
  });

  it("detecta tags e handlers isolados", () => {
    expect(containsHtml("<img src=x onerror=alert(1)>")).toBe(true);
    expect(containsHtml("<script>")).toBe(true);
    expect(containsHtml("a > b")).toBe(true);
    expect(containsHtml("javascript:alert(1)")).toBe(true);
  });

  it("aceita nomes legítimos de ótica", () => {
    expect(containsHtml("Óticas P.S Vision")).toBe(false);
    expect(containsHtml("Ótica do João & Filhos")).toBe(false);
    expect(containsHtml("Rede Vê Bem - Matriz")).toBe(false);
    expect(containsHtml("Ótica 20/20")).toBe(false);
  });
});

describe("safeName", () => {
  const schema = safeName("Nome da empresa");

  it("rejeita o payload de ataque", () => {
    const r = schema.safeParse(ATTACK_PAYLOAD);
    expect(r.success).toBe(false);
  });

  it("aceita e apara um nome legítimo", () => {
    const r = schema.safeParse("  Óticas P.S Vision  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("Óticas P.S Vision");
  });

  it("rejeita vazio e só-espaços", () => {
    expect(schema.safeParse("").success).toBe(false);
    expect(schema.safeParse("   ").success).toBe(false);
  });

  it("rejeita acima do limite de tamanho", () => {
    expect(safeName("X", 10).safeParse("a".repeat(11)).success).toBe(false);
    expect(safeName("X", 10).safeParse("a".repeat(10)).success).toBe(true);
  });
});

describe("safeFreeText", () => {
  const schema = safeFreeText("Observações");

  it("rejeita HTML mesmo em texto livre", () => {
    expect(schema.safeParse("<div>oi</div>").success).toBe(false);
  });

  it("aceita texto plano e vazio", () => {
    expect(schema.safeParse("Cliente antigo, bom pagador").success).toBe(true);
    expect(schema.safeParse("").success).toBe(true);
  });
});
