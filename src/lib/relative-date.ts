// Helper puro de datas para o painel de novidades do login.
// `today` é injetável para testes determinísticos; default = agora.

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Dias inteiros desde `date` até `today`. null se inválida ou futura. */
export function daysAgo(date: string, today: string = new Date().toISOString().slice(0, 10)): number | null {
  const then = Date.parse(`${date}T00:00:00`);
  const now = Date.parse(`${today}T00:00:00`);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
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
