/**
 * Imprime o cabeçalho padrão antes de qualquer script de diagnóstico/correção:
 * - URL do banco (mascarada)
 * - Modo (dry-run / apply)
 * - Pede confirmação digitada se for --apply
 */

import { CliOptions, formatMode } from "./cli";
import { askConfirm } from "./confirm";
import { maskDatabaseUrl } from "./env";

export interface BannerInput {
  scriptName: string;
  description: string;
  databaseUrl: string;
  options: CliOptions;
  isReadOnly?: boolean; // true para diagnose-* (não pede confirmação mesmo sem --apply)
}

/**
 * Imprime o cabeçalho e, se for --apply, pede CONFIRMO.
 * Retorna true se pode prosseguir, false se o usuário não confirmou.
 */
export async function showBanner(input: BannerInput): Promise<boolean> {
  const { scriptName, description, databaseUrl, options, isReadOnly } = input;

  console.log("\n" + "=".repeat(72));
  console.log(`Script: ${scriptName}`);
  console.log(`Descrição: ${description}`);
  console.log(`Banco: ${maskDatabaseUrl(databaseUrl)}`);
  console.log(`Modo: ${isReadOnly ? "READ-ONLY (diagnóstico)" : formatMode(options)}`);
  if (options.companyId) console.log(`Filtro companyId: ${options.companyId}`);
  if (options.startDate) console.log(`Filtro startDate: ${options.startDate}`);
  if (options.endDate) console.log(`Filtro endDate: ${options.endDate}`);
  if (options.limit !== undefined) console.log(`Filtro limit: ${options.limit}`);
  console.log("=".repeat(72) + "\n");

  if (isReadOnly) {
    return true;
  }

  if (options.dryRun) {
    console.log(
      "→ Modo DRY-RUN. Nenhuma escrita será feita.\n" +
        "→ Para aplicar de verdade: --apply --i-know-what-im-doing\n"
    );
    return true;
  }

  // --apply: pede confirmação
  console.log(
    "⚠️  ATENÇÃO: este script vai ESCREVER NO BANCO.\n" +
      "   Apenas prossiga se já validou o dry-run e está em horário seguro.\n"
  );
  const ok = await askConfirm('Digite "CONFIRMO" para prosseguir: ');
  if (!ok) {
    console.log("\n→ Confirmação não recebida. Abortando.\n");
    return false;
  }
  return true;
}
