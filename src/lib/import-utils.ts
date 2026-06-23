import { parse, isValid } from "date-fns";

/**
 * Parseia uma data de planilha aceitando dd/MM/yyyy (texto) ou serial Excel
 * (número de dias desde 1899-12-30). Retorna null se vazio/inválido.
 *
 * Usado na importação de clientes para "Data de Nascimento" e
 * "Data de Cadastro" (bug rotina 21/06: "Cliente desde" trazia a data da
 * importação em bloco em vez da data real de cadastro do cliente).
 */
export function parseSpreadsheetDate(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;

  if (typeof raw === "number") {
    // Serial Excel: dias desde 1899-12-30. Usa UTC para não deslocar a data
    // por causa do fuso/DST (ex.: em BRT, somar 86400000ms a uma meia-noite
    // local cruzava a meia-noite e jogava a data para o dia anterior/seguinte).
    const utcMs = Date.UTC(1899, 11, 30) + raw * 86400000;
    const date = new Date(utcMs);
    if (!isValid(date)) return null;
    // Reconstrói em horário local preservando o dia civil (Y/M/D em UTC).
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    );
  }

  const dateStr = String(raw).trim();
  if (dateStr === "") return null;
  const parsed = parse(dateStr, "dd/MM/yyyy", new Date());
  return isValid(parsed) ? parsed : null;
}

const TRUTHY_VALUES = new Set([
  "sim",
  "s",
  "yes",
  "y",
  "ativo",
  "ativa",
  "active",
  "true",
  "verdadeiro",
  "v",
  "1",
]);

const FALSY_VALUES = new Set([
  "não",
  "nao",
  "n",
  "no",
  "inativo",
  "inativa",
  "inactive",
  "false",
  "falso",
  "f",
  "0",
]);

export type BooleanFieldResult = {
  value: boolean;
  recognized: boolean;
};

export function parseBooleanField(
  raw: unknown,
  defaultValue: boolean,
): BooleanFieldResult {
  if (raw === undefined || raw === null || raw === "") {
    return { value: defaultValue, recognized: true };
  }
  if (typeof raw === "boolean") {
    return { value: raw, recognized: true };
  }
  if (typeof raw === "number") {
    return { value: raw !== 0, recognized: true };
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "") {
    return { value: defaultValue, recognized: true };
  }
  if (TRUTHY_VALUES.has(normalized)) {
    return { value: true, recognized: true };
  }
  if (FALSY_VALUES.has(normalized)) {
    return { value: false, recognized: true };
  }
  return { value: defaultValue, recognized: false };
}
