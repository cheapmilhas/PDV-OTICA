import { defineConfig } from "vitest/config";
import path from "node:path";

// Per-file env override via doc comment:
//   /** @vitest-environment jsdom */
// no topo de testes React (.test.tsx ou DOM-related .test.ts).
// Default: node (server-side code, services, libs).
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Fixa o fuso dos testes no fuso da aplicação (BRT). Sem isto, testes que
    // dependem de data (ex.: computeMrrSeries) passavam em máquina local (BRT) e
    // FALHAVAM no CI (UTC) — divergência determinística que travava todo PR.
    // NOTA: a Vercel roda em UTC em produção; este pin torna os testes estáveis
    // mas NÃO cobre o comportamento UTC-prod — ver dívida [[admin-metrics fuso]]
    // (computeMrrSeries mistura getters locais no `key` com toLocaleString BRT no
    // rótulo → série de MRR pode sair miskeyed em prod UTC). Corrigir à parte.
    env: { TZ: "America/Sao_Paulo" },
    include: [
      "src/**/__tests__/**/*.test.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", ".next", "scripts/_archive", "scripts/qa-integration"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/lib/**", "src/services/**"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.d.ts",
        "src/lib/prisma.ts",
      ],
      thresholds: {
        // Começa baixo; sobe à medida que adiciona testes
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
