/**
 * Presets de período do placar de conversão do funil (Sprint 2, #6).
 *
 * O dono/atendente escolhe um preset simples ("30 dias") em vez de digitar datas
 * — o servidor deriva a janela a partir de `now` (nunca do relógio do cliente).
 * `ALL` = sem borda (histórico inteiro). Vocabulário único compartilhado entre a
 * rota (deriva a janela) e a UI (lista as opções), para não divergirem.
 */
import { startOfLocalDay } from "./date-utils";

export type LeadStatsPeriod = "today" | "7d" | "30d" | "90d" | "all";

export const LEAD_STATS_PERIODS: { value: LeadStatsPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
];

const DEFAULT_PERIOD: LeadStatsPeriod = "30d";

/**
 * Normaliza um valor cru de query (`?period=`) para um preset válido. Qualquer
 * valor desconhecido/ausente cai no padrão (30 dias) — nunca lança, para o placar
 * degradar suave em vez de quebrar a rota inteira por um param torto.
 */
export function parseLeadStatsPeriod(raw: string | null | undefined): LeadStatsPeriod {
  const match = LEAD_STATS_PERIODS.find((p) => p.value === raw);
  return match ? match.value : DEFAULT_PERIOD;
}

/**
 * Deriva a janela `{ from }` do preset a partir de `now`. `today` = início do dia
 * NO FUSO DA ÓTICA (America/Sao_Paulo, via startOfLocalDay) — não do servidor, que
 * na Vercel é UTC e faria "Hoje" começar às 21h BRT do dia anterior; `Nd` = N dias
 * atrás; `all` = sem borda (`{}`). `to` fica em aberto de propósito (queremos "até
 * agora", e leads futuros não existem).
 */
export function periodToRange(
  period: LeadStatsPeriod,
  now: Date = new Date()
): { from?: Date } {
  switch (period) {
    case "all":
      return {};
    case "today":
      return { from: startOfLocalDay(now) };
    case "7d":
      return { from: daysAgo(now, 7) };
    case "30d":
      return { from: daysAgo(now, 30) };
    case "90d":
      return { from: daysAgo(now, 90) };
  }
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
