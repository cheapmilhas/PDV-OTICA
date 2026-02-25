import Papa from "papaparse";

interface ColumnMapping {
  date: number | string;
  nsu?: number | string;
  authCode?: number | string;
  brand?: number | string;
  lastDigits?: number | string;
  installments?: number | string;
  grossAmount: number | string;
  netAmount?: number | string;
  feeAmount?: number | string;
}

interface TemplateConfig {
  columnMapping: ColumnMapping;
  delimiter: string;
  dateFormat: string;
  decimalSep: string;
  skipRows: number;
}

export interface ParsedItem {
  externalDate: Date;
  externalAmount: number;
  externalId?: string;      // NSU
  externalRef?: string;     // Auth code
  cardBrand?: string;
  cardLastDigits?: string;
  installments?: number;
  netAmount?: number;
  feeAmount?: number;
  rawData: Record<string, string>;
}

interface ParseResult {
  items: ParsedItem[];
  totalAmount: number;
  errors: string[];
}

/**
 * Parseia data no formato brasileiro (dd/MM/yyyy).
 */
function parseDateBR(dateStr: string, format: string): Date | null {
  if (!dateStr) return null;

  const cleaned = dateStr.trim();

  // dd/MM/yyyy
  if (format === "dd/MM/yyyy" || format === "dd/mm/yyyy") {
    const parts = cleaned.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year < 100 ? year + 2000 : year, month, day);
      }
    }
  }

  // yyyy-MM-dd
  if (format === "yyyy-MM-dd") {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parseia número no formato brasileiro (vírgula como decimal).
 */
function parseNumberBR(numStr: string, decimalSep: string): number {
  if (!numStr) return 0;
  let cleaned = numStr.trim();

  if (decimalSep === ",") {
    // Remove separador de milhar (ponto) e troca vírgula por ponto
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function getCellValue(row: string[], colIndex: number | string): string {
  if (typeof colIndex === "number") {
    return row[colIndex]?.trim() || "";
  }
  return "";
}

/**
 * Parse CSV com papaparse usando template de colunas.
 */
export function parseCSV(
  fileContent: string,
  template: TemplateConfig
): ParseResult {
  const { columnMapping, delimiter, dateFormat, decimalSep, skipRows } = template;
  const errors: string[] = [];
  const items: ParsedItem[] = [];
  let totalAmount = 0;

  // Parse CSV
  const result = Papa.parse<string[]>(fileContent, {
    delimiter: delimiter || ",",
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      errors.push(`Linha ${err.row}: ${err.message}`);
    }
  }

  const rows = result.data.slice(skipRows);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + skipRows + 1;

    try {
      // Data
      const dateStr = getCellValue(row, columnMapping.date as number);
      const date = parseDateBR(dateStr, dateFormat);
      if (!date) {
        errors.push(`Linha ${lineNum}: data inválida "${dateStr}"`);
        continue;
      }

      // Valor
      const amountStr = getCellValue(row, columnMapping.grossAmount as number);
      const amount = parseNumberBR(amountStr, decimalSep);
      if (amount === 0) {
        errors.push(`Linha ${lineNum}: valor zerado ou inválido "${amountStr}"`);
        continue;
      }

      const item: ParsedItem = {
        externalDate: date,
        externalAmount: Math.abs(amount),
        rawData: row.reduce((obj, val, idx) => {
          obj[`col${idx}`] = val;
          return obj;
        }, {} as Record<string, string>),
      };

      // NSU
      if (columnMapping.nsu !== undefined) {
        item.externalId = getCellValue(row, columnMapping.nsu as number);
      }

      // Auth code
      if (columnMapping.authCode !== undefined) {
        item.externalRef = getCellValue(row, columnMapping.authCode as number);
      }

      // Brand
      if (columnMapping.brand !== undefined) {
        item.cardBrand = getCellValue(row, columnMapping.brand as number).toUpperCase();
      }

      // Last digits
      if (columnMapping.lastDigits !== undefined) {
        item.cardLastDigits = getCellValue(row, columnMapping.lastDigits as number);
      }

      // Installments
      if (columnMapping.installments !== undefined) {
        const inst = parseInt(getCellValue(row, columnMapping.installments as number));
        if (!isNaN(inst)) item.installments = inst;
      }

      // Net amount
      if (columnMapping.netAmount !== undefined) {
        const netStr = getCellValue(row, columnMapping.netAmount as number);
        item.netAmount = parseNumberBR(netStr, decimalSep);
      }

      // Fee amount
      if (columnMapping.feeAmount !== undefined) {
        const feeStr = getCellValue(row, columnMapping.feeAmount as number);
        item.feeAmount = parseNumberBR(feeStr, decimalSep);
      }

      items.push(item);
      totalAmount += item.externalAmount;
    } catch (err) {
      errors.push(`Linha ${lineNum}: erro ao processar - ${err}`);
    }
  }

  return {
    items,
    totalAmount: Math.round(totalAmount * 100) / 100,
    errors,
  };
}
