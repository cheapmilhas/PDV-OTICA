/**
 * Carrega .env.diagnostic (NÃO o .env principal) e expõe DATABASE_URL.
 * Usado por TODOS os scripts em /scripts/diagnose-*.ts e /scripts/fix-*.ts.
 *
 * Motivo: separar a URL usada por scripts ad-hoc da URL usada pela aplicação,
 * para reduzir o risco de rodar um script contra o banco errado por engano.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ENV_FILE = ".env.diagnostic";

interface DiagnosticEnv {
  DATABASE_URL: string;
  DIRECT_URL?: string;
}

/**
 * Lê e parseia .env.diagnostic.
 * Lança erro com instruções claras se o arquivo não existir.
 */
export function loadDiagnosticEnv(): DiagnosticEnv {
  const envPath = resolve(process.cwd(), ENV_FILE);

  if (!existsSync(envPath)) {
    throw new Error(
      `\n[ENV] Arquivo ${ENV_FILE} não encontrado em ${envPath}.\n\n` +
        `Para criar:\n` +
        `  cp .env.diagnostic.example ${ENV_FILE}\n` +
        `  # então edite o arquivo e preencha DATABASE_URL\n\n` +
        `Os scripts em /scripts/diagnose-* e /scripts/fix-* leem APENAS este\n` +
        `arquivo, não o .env principal.\n`
    );
  }

  const raw = readFileSync(envPath, "utf-8");
  const parsed: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  if (!parsed.DATABASE_URL) {
    throw new Error(
      `\n[ENV] DATABASE_URL não definida em ${ENV_FILE}.\n` +
        `Edite o arquivo e preencha a URL completa.\n`
    );
  }

  // Injeta no process.env para que o PrismaClient encontre.
  process.env.DATABASE_URL = parsed.DATABASE_URL;
  if (parsed.DIRECT_URL) {
    process.env.DIRECT_URL = parsed.DIRECT_URL;
  }

  return {
    DATABASE_URL: parsed.DATABASE_URL,
    DIRECT_URL: parsed.DIRECT_URL,
  };
}

/**
 * Mascara a senha em uma URL postgres, mantendo host e database visíveis.
 *
 * postgresql://user:s3cr3t@host:5432/dbname?sslmode=require
 *   →  postgresql://user:***@host:5432/dbname
 */
export function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const masked = `${parsed.protocol}//${parsed.username}:***@${parsed.host}${parsed.pathname}`;
    return masked;
  } catch {
    return "(URL inválida — não foi possível mascarar)";
  }
}
