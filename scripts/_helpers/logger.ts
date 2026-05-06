/**
 * Logger simples que escreve no console E em scripts/logs/<nome>-<timestamp>.log
 *
 * Usado por scripts de migração para auditoria do que foi feito.
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

export interface ScriptLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  json: (label: string, data: unknown) => void;
  filePath: string;
}

export function createLogger(scriptName: string): ScriptLogger {
  const logsDir = resolve(process.cwd(), "scripts/logs");
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = resolve(logsDir, `${scriptName}-${timestamp}.log`);

  // Cabeçalho do arquivo
  writeFileSync(
    filePath,
    `# Script: ${scriptName}\n# Início: ${new Date().toISOString()}\n# PID: ${process.pid}\n\n`,
    "utf-8"
  );

  function write(level: string, msg: string) {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
    appendFileSync(filePath, line, "utf-8");
    if (level === "ERROR") {
      console.error(`[${level}] ${msg}`);
    } else if (level === "WARN") {
      console.warn(`[${level}] ${msg}`);
    } else {
      console.log(`[${level}] ${msg}`);
    }
  }

  return {
    info: (msg) => write("INFO", msg),
    warn: (msg) => write("WARN", msg),
    error: (msg) => write("ERROR", msg),
    json: (label, data) => write("JSON", `${label} ${JSON.stringify(data, null, 2)}`),
    filePath,
  };
}
