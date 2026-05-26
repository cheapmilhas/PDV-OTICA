/**
 * IMPORTAR ANTES DE TUDO em qualquer script que use services do projeto.
 *
 * - Carrega .env.test.local
 * - REESCREVE DATABASE_URL/DIRECT_URL para apontar exclusivamente ao branch de teste
 * - ABORTA se algo na URL parecer produção
 *
 * Uso:
 *   import "./_env-shim";   // PRIMEIRA linha
 *   import { saleService } from "@/services/sale.service";
 */
import * as fs from "node:fs";
import * as path from "node:path";

const PROD_HOST_FRAGMENT = "ep-blue-thunder";

function loadEnvTestLocal() {
  const envPath = path.resolve(__dirname, "..", "..", ".env.test.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`[QA-GUARD] .env.test.local não encontrado em ${envPath}`);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

function assertSafe(url: string | undefined, label: string): string {
  if (!url) throw new Error(`[QA-GUARD] ${label} ausente`);
  const lc = url.toLowerCase();
  if (lc.includes(PROD_HOST_FRAGMENT)) {
    throw new Error(
      `[QA-GUARD] ${label} contém fragmento de PROD (${PROD_HOST_FRAGMENT}) — ABORTANDO`,
    );
  }
  if (!lc.includes("neon.tech")) {
    throw new Error(`[QA-GUARD] ${label} não parece ser Neon — ABORTANDO`);
  }
  return url;
}

loadEnvTestLocal();

const testUrl = assertSafe(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
const testDirect = assertSafe(process.env.TEST_DIRECT_URL, "TEST_DIRECT_URL");

// REESCREVE para o singleton do projeto consumir
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testDirect;

// Garante NODE_ENV != production para que o singleton aceite globalForPrisma
if (!process.env.NODE_ENV) process.env.NODE_ENV = "test";

console.log(
  `[QA-ENV] DATABASE_URL reescrito para branch de teste: ${testUrl.replace(/:[^:@]+@/, ":***@")}`,
);
