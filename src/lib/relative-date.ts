// Helper puro de datas para o painel de novidades do login.
// `today` é injetável para testes determinísticos; default = agora.

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte "YYYY-MM-DD" em ms UTC da meia-noite. null se o formato não for ISO
 * estrito OU se a data de calendário for impossível (ex: 2026-02-30 — validado
 * por round-trip: o Date normalizaria pra 03-02, então os componentes não batem).
 */
function parseIsoDateUtc(value: string): number | null {
  if (!ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

/** "Hoje" em UTC (YYYY-MM-DD). UTC evita o bug de a data virar cedo em fusos negativos. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dias inteiros desde `date` até `today`. null se inválida ou futura. Tudo em UTC. */
export function daysAgo(date: string, today: string = todayUtc()): number | null {
  const then = parseIsoDateUtc(date);
  const now = parseIsoDateUtc(today);
  if (then === null || now === null) return null;
  const diff = Math.floor((now - then) / MS_PER_DAY);
  return diff < 0 ? null : diff;
}

/** "hoje" | "há 1 dia" | "há N dias" | "" (inválida/futura). */
export function formatRelative(date: string, today?: string): string {
  const d = daysAgo(date, today);
  if (d === null) return "";
  if (d === 0) return "hoje";
  if (d === 1) return "há 1 dia";
  return `há ${d} dias`;
}
