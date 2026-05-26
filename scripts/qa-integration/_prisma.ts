/**
 * Prisma factory APENAS para testes de integração contra o branch Neon teste-qa-*.
 *
 * Guardrails:
 *  - Exige TEST_DATABASE_URL no env (lido de .env.test.local)
 *  - ABORTA imediatamente se a URL contiver o host de produção (ep-blue-thunder)
 *  - ABORTA se a URL contiver "prod", "production"
 *  - Loga o host conectado em cada run para evidência
 *
 * NÃO importa do singleton em src/lib/prisma.ts (que usa DATABASE_URL).
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";

const PROD_HOST_FRAGMENT = "ep-blue-thunder"; // host atual do production
const FORBIDDEN_SUBSTRINGS = [PROD_HOST_FRAGMENT, "production"];

function loadEnvTestLocal(): void {
  const envPath = path.resolve(__dirname, "..", "..", ".env.test.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`[QA-GUARD] .env.test.local não encontrado em ${envPath}`);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function assertSafeTestUrl(url: string | undefined, label: string): string {
  if (!url) {
    throw new Error(
      `[QA-GUARD] ${label} ausente. Garanta que .env.test.local define ${label}.`,
    );
  }
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    if (url.toLowerCase().includes(bad.toLowerCase())) {
      throw new Error(
        `[QA-GUARD] ${label} contém fragmento PROIBIDO ("${bad}") — ABORTANDO. URL: ${url.replace(/:[^:@]+@/, ":***@")}`,
      );
    }
  }
  // Tem que ser do projeto Neon (host estilo neon.tech)
  if (!url.includes("neon.tech")) {
    throw new Error(
      `[QA-GUARD] ${label} não parece ser do Neon — ABORTANDO. URL: ${url.replace(/:[^:@]+@/, ":***@")}`,
    );
  }
  return url;
}

let _client: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (_client) return _client;
  loadEnvTestLocal();
  const url = assertSafeTestUrl(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
  const safe = url.replace(/:[^:@]+@/, ":***@");
  // Loga sempre para evidência
  console.log(`[QA-DB] Conectando em: ${safe}`);
  _client = new PrismaClient({
    datasources: { db: { url } },
    log: ["error", "warn"],
  });
  return _client;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
}

export const TEST_QA_PREFIX = `TESTE_QA_${new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .slice(0, 19)}`;
