/**
 * Utilitário centralizado de timezone para o sistema PDV Ótica.
 *
 * O banco PostgreSQL armazena datas em UTC.
 * O cliente opera em America/Sao_Paulo (UTC-3).
 * Todas as conversões de exibição e filtros devem usar estas funções.
 */
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export const TIMEZONE = "America/Sao_Paulo";

/**
 * Converte data UTC do banco para horário local (para EXIBIÇÃO).
 * Ex: 2026-03-16T11:41:00Z → 2026-03-16T08:41:00 (Sao Paulo)
 */
export function toLocalTime(utcDate: Date | string): Date {
  return toZonedTime(new Date(utcDate), TIMEZONE);
}

/**
 * Converte data em horário local para UTC (para SALVAR no banco).
 * Ex: 2026-03-23 (input do formulário, dia 23 em SP) → 2026-03-23T03:00:00Z
 *
 * Use quando o usuário digita uma data (ex: prazo de entrega, vencimento de parcela)
 * e você precisa salvar no banco representando aquele dia no fuso local.
 */
export function toUTCFromLocal(localDate: Date | string): Date {
  return fromZonedTime(new Date(localDate), TIMEZONE);
}

/**
 * Converte string de data 'YYYY-MM-DD' para UTC representando meio-dia no fuso local.
 * Evita o problema de new Date('2026-03-23') = 2026-03-23T00:00:00Z = dia 22 em SP.
 *
 * Use para datas "apenas dia" (sem hora) como vencimento, prazo de entrega, etc.
 */
export function dateOnlyToUTC(dateStr: string): Date {
  // Extrai apenas a parte YYYY-MM-DD (ignora hora se vier ISO completa)
  const dateOnly = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  // Adiciona T12:00:00 no fuso local para garantir que não caia no dia anterior
  return fromZonedTime(new Date(`${dateOnly}T12:00:00`), TIMEZONE);
}

/**
 * Início do dia no fuso local convertido para UTC (para filtros de relatório).
 * Ex: 2026-03-01 em SP → 2026-03-01T03:00:00Z
 */
export function startOfLocalDay(date: Date | string): Date {
  const d = new Date(date);
  const local = toZonedTime(d, TIMEZONE);
  local.setHours(0, 0, 0, 0);
  return fromZonedTime(local, TIMEZONE);
}

/**
 * Fim do dia no fuso local convertido para UTC (para filtros de relatório).
 * Ex: 2026-03-16 em SP → 2026-03-17T02:59:59.999Z
 */
export function endOfLocalDay(date: Date | string): Date {
  const d = new Date(date);
  const local = toZonedTime(d, TIMEZONE);
  local.setHours(23, 59, 59, 999);
  return fromZonedTime(local, TIMEZONE);
}

/**
 * Início do mês no fuso local convertido para UTC.
 */
export function startOfLocalMonth(date?: Date): Date {
  const now = date || new Date();
  const local = toZonedTime(now, TIMEZONE);
  local.setDate(1);
  local.setHours(0, 0, 0, 0);
  return fromZonedTime(local, TIMEZONE);
}

/**
 * Fim do mês no fuso local convertido para UTC.
 */
export function endOfLocalMonth(date?: Date): Date {
  const now = date || new Date();
  const local = toZonedTime(now, TIMEZONE);
  local.setMonth(local.getMonth() + 1, 0); // Último dia do mês
  local.setHours(23, 59, 59, 999);
  return fromZonedTime(local, TIMEZONE);
}

/**
 * Extrai a hora no fuso local (para "Horário de Pico").
 * Ex: 2026-03-16T11:41:00Z → 8 (8h em São Paulo)
 */
export function getLocalHour(utcDate: Date | string): number {
  const local = toZonedTime(new Date(utcDate), TIMEZONE);
  return local.getHours();
}

/**
 * Formata data UTC para exibição no fuso local.
 * Evita o bug de datas "date-only" (T00:00:00Z) mostrarem dia anterior.
 *
 * Ex: "2026-03-23T00:00:00Z" → "23/03/2026" (em SP, sem cair pra 22/03)
 */
export function formatDateBR(utcDate: Date | string | null | undefined): string {
  if (!utcDate) return "-";
  const d = new Date(utcDate);
  // Extrai dia/mês/ano da data UTC diretamente (ignora timezone)
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formata data+hora UTC para exibição no fuso local (America/Sao_Paulo).
 * Usa quando a hora importa (ex: data de criação, hora do pagamento).
 */
export function formatDateTimeBR(utcDate: Date | string | null | undefined): string {
  if (!utcDate) return "-";
  const local = toZonedTime(new Date(utcDate), TIMEZONE);
  const day = String(local.getDate()).padStart(2, "0");
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const year = local.getFullYear();
  const hours = String(local.getHours()).padStart(2, "0");
  const minutes = String(local.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
