import ExcelJS from "exceljs";

/**
 * Leitura segura de planilhas (.xlsx) para os fluxos de IMPORT.
 *
 * Segurança (pentest 2026-06-27): substitui `XLSX.read` da lib `xlsx` (sheetjs)
 * @0.18.5, que carrega CVE-2023-30533 (prototype pollution) e CVE-2024-22363
 * (ReDoS) — ambas exploráveis via arquivo malicioso passado a `XLSX.read`.
 * `exceljs` (mantida, distribuída no npm) não tem essas CVEs. Só os 3 endpoints
 * de import (que leem input do usuário) usam isto; os exports seguem em `xlsx`
 * pois apenas ESCREVEM (sem superfície de ataque por input).
 *
 * Retorna o mesmo formato que `XLSX.utils.sheet_to_json` produzia: um array de
 * objetos, uma entrada por linha de dados, com chaves = textos do cabeçalho
 * (primeira linha). Células vazias são omitidas do objeto da linha.
 */
export async function readXlsxRows(
  buffer: Buffer
): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs aceita ArrayBuffer/Buffer; o tipo nominal diverge entre versões do
  // @types/node, então normalizamos via Uint8Array (aceito em runtime).
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  // Cabeçalho = primeira linha. Mapeia índice de coluna → nome do cabeçalho.
  const headerRow = worksheet.getRow(1);
  const headers = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellToText(cell.value);
    if (text) headers.set(colNumber, text);
  });

  if (headers.size === 0) return [];

  const rows: Record<string, unknown>[] = [];
  const lastRow = worksheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = worksheet.getRow(r);
    const obj: Record<string, unknown> = {};
    let hasAny = false;
    for (const [col, header] of headers) {
      const value = normalizeCell(row.getCell(col).value);
      if (value !== null && value !== undefined && value !== "") {
        obj[header] = value;
        hasAny = true;
      }
    }
    if (hasAny) rows.push(obj);
  }
  return rows;
}

/** Texto do cabeçalho (sempre string, trim). */
function cellToText(value: ExcelJS.CellValue): string {
  const v = normalizeCell(value);
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Normaliza o valor de uma célula exceljs para um primitivo comparável ao que
 * sheetjs entregava: string | number | boolean | Date. Trata rich text,
 * hyperlinks e fórmulas (usa o resultado calculado).
 */
function normalizeCell(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    // Fórmula: usa o resultado calculado.
    if ("result" in v) return normalizeCell(v.result as ExcelJS.CellValue);
    // Hyperlink: usa o texto exibido.
    if ("text" in v) return v.text;
    // Rich text: concatena os fragmentos.
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    }
  }
  return null;
}
