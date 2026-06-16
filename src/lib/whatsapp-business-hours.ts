/**
 * Horário comercial p/ envio de WhatsApp (anti-bloqueio): 8h–18h em
 * America/Sao_Paulo, pula domingo e feriados nacionais de DATA FIXA.
 * Feriados móveis (Carnaval etc.) ficam para a Fase 2.
 */

const OPEN_HOUR = 8;
const CLOSE_HOUR = 18; // exclusivo: vale até 17:59

/** Feriados nacionais de data fixa (MM-DD). */
const FIXED_HOLIDAYS = new Set([
  "01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25",
]);

/** Partes de data/hora em America/Sao_Paulo. */
function partsInSP(d: Date): { weekday: number; hour: number; mmdd: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short", hour: "2-digit", hour12: false,
    month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // hour12:false pode devolver "24" para meia-noite em alguns ambientes → normaliza p/ 0.
  const hour = Number(parts.hour) % 24;
  return {
    weekday: weekdayMap[parts.weekday as string] ?? 0,
    hour,
    mmdd: `${parts.month}-${parts.day}`,
  };
}

export function isWithinBusinessHours(now: Date = new Date()): boolean {
  const { weekday, hour, mmdd } = partsInSP(now);
  if (weekday === 0) return false;          // domingo
  if (FIXED_HOLIDAYS.has(mmdd)) return false;
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

/** Início e fim do dia civil em America/Sao_Paulo, em UTC (p/ contar o teto). */
export function spDayRange(now: Date = new Date()): { start: Date; end: Date } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const ymd = fmt.format(now); // "yyyy-MM-dd"
  // BRT = UTC-3 (sem horário de verão desde 2019). Dia 00:00 BRT = 03:00 UTC.
  const start = new Date(`${ymd}T03:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
