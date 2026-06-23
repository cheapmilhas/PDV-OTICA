import { parse, isValid } from "date-fns";

/**
 * Parseia uma data de planilha aceitando dd/MM/yyyy (texto) ou serial Excel
 * (número de dias desde 1899-12-30). Retorna null se vazio/inválido.
 *
 * Retorna SEMPRE a data fixada em MEIA-NOITE UTC (00:00:00.000Z). Isso é
 * essencial: se a data fosse meia-noite LOCAL, ao ser gravada no banco (UTC) e
 * relida no navegador em BRT (UTC-3) ela recuaria 1 dia — o mesmo bug histórico
 * do birthDate. Fixando em UTC, o dia civil sobrevive ao round-trip
 * independente do fuso do servidor (Vercel=UTC) e do cliente. Quem exibe deve
 * usar o dia em UTC (ex.: format(parseISO(value.slice(0,10)))).
 *
 * Usado na importação de clientes para "Data de Nascimento" e "Data de
 * Cadastro" (bug rotina 21/06: "Cliente desde" trazia a data da importação em
 * bloco em vez da data real de cadastro do cliente).
 */
export function parseSpreadsheetDate(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;

  // xlsx com cellDates:true pode entregar Date nativo — normaliza pelo dia civil.
  if (raw instanceof Date) {
    if (!isValid(raw)) return null;
    return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()));
  }

  if (typeof raw === "number") {
    // Serial Excel: dias desde 1899-12-30, em UTC (meia-noite UTC do dia civil).
    const utcMs = Date.UTC(1899, 11, 30) + raw * 86400000;
    const date = new Date(utcMs);
    if (!isValid(date)) return null;
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
  }

  const dateStr = String(raw).trim();
  if (dateStr === "") return null;
  const parsed = parse(dateStr, "dd/MM/yyyy", new Date());
  if (!isValid(parsed)) return null;
  // parse() devolve meia-noite LOCAL; reconstrói em UTC preservando o dia civil.
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  );
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
