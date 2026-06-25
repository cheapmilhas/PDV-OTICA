import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Bloco 1 (item secundário): notas de admin agora amarram noteId+companyId.
// Teste de fonte (regressão): garante que update/delete não voltem a usar só id.

const FILE = join(
  process.cwd(),
  "src/app/api/admin/clientes/[id]/notes/[noteId]/route.ts"
);
const src = readFileSync(FILE, "utf-8");

describe("admin notes — ownership noteId+companyId", () => {
  it("PATCH usa updateMany com { id: noteId, companyId }", () => {
    expect(src).toMatch(/updateMany\(\s*\{\s*where:\s*\{\s*id:\s*noteId,\s*companyId\s*\}/);
  });

  it("DELETE usa deleteMany com { id: noteId, companyId }", () => {
    expect(src).toMatch(/deleteMany\(\s*\{\s*where:\s*\{\s*id:\s*noteId,\s*companyId\s*\}/);
  });

  it("extrai companyId do path (id) e usa", () => {
    expect(src).toMatch(/const\s*\{\s*id:\s*companyId,\s*noteId\s*\}\s*=\s*await\s*params/);
  });

  it("não usa mais update/delete cru só por { id: noteId }", () => {
    expect(src).not.toMatch(/\.update\(\s*\{\s*where:\s*\{\s*id:\s*noteId\s*\}/);
    expect(src).not.toMatch(/\.delete\(\s*\{\s*where:\s*\{\s*id:\s*noteId\s*\}/);
  });
});
