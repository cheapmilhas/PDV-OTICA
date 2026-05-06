/**
 * Parsing simples de flags de CLI usado por scripts de correção/diagnóstico.
 *
 * Convenções:
 * - --dry-run é o DEFAULT. Sem flags ou só com --apply, ainda é dry-run.
 * - Para escrever de verdade exige AMBAS:
 *     --apply --i-know-what-im-doing
 * - --company-id <id>, --start-date <YYYY-MM-DD>, --end-date <YYYY-MM-DD>
 *   --limit <n>
 */

export interface CliOptions {
  apply: boolean; // true se --apply E --i-know-what-im-doing
  dryRun: boolean; // !apply
  companyId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const has = (flag: string) => args.includes(flag);
  const valueOf = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx === args.length - 1) return undefined;
    const next = args[idx + 1];
    if (next.startsWith("--")) return undefined;
    return next;
  };

  const apply = has("--apply") && has("--i-know-what-im-doing");
  const dryRun = !apply;

  const limitStr = valueOf("--limit");
  const limit = limitStr ? Number(limitStr) : undefined;
  if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
    throw new Error("--limit deve ser um inteiro >= 1");
  }

  return {
    apply,
    dryRun,
    companyId: valueOf("--company-id"),
    startDate: valueOf("--start-date"),
    endDate: valueOf("--end-date"),
    limit,
  };
}

export function formatMode(opts: CliOptions): string {
  return opts.apply ? "APPLY (escrita real)" : "DRY-RUN (somente leitura)";
}

export function printUsage(scriptName: string, extra?: string) {
  console.log(
    `\nUso: npx tsx ${scriptName} [flags]\n\n` +
      `Modos:\n` +
      `  (sem flags)                       → dry-run (somente leitura)\n` +
      `  --apply --i-know-what-im-doing    → escrita real (exige confirmação)\n\n` +
      `Filtros opcionais:\n` +
      `  --company-id <cuid>     limita a uma empresa\n` +
      `  --start-date <YYYY-MM-DD>\n` +
      `  --end-date <YYYY-MM-DD>\n` +
      `  --limit <n>             limita N registros por execução\n` +
      (extra ? `\n${extra}\n` : "")
  );
}
