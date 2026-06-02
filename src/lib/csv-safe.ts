/** Sanitiza uma célula para CSV: neutraliza injeção de fórmula e escapa aspas. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  // Números são valores do sistema, não vetor de injeção. Emite cru (sem aspas,
  // sem prefixo) para preservar negativos/decimais como número no Excel.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

/** Junta uma linha de células já sanitizadas. */
export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}
