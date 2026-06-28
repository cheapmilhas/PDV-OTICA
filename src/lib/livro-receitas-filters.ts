import { startOfLocalDay, endOfLocalDay } from "@/lib/date-utils";
import { addDays, subYears } from "date-fns";

/** Atalhos de data do Livro de Receitas. Single-select. */
export type DateChip = "todas" | "vence30" | "vencidas" | "idade1a2" | "idade2mais";

/** Params de data resolvidos a partir de um chip. Campos ausentes = não filtrar. */
export interface DateParams {
  validadeDe?: Date;
  validadeAte?: Date;
  emitidaDe?: Date;
  emitidaAte?: Date;
}

/**
 * Mapeia um chip → params de data, ancorado em "hoje" no fuso America/Sao_Paulo.
 * `now` é injetável para teste determinístico (default: agora).
 */
export function chipToDateParams(chip: DateChip, now: Date = new Date()): DateParams {
  const hoje = startOfLocalDay(now); // 00:00 BRT de hoje, em UTC

  switch (chip) {
    case "todas":
      return {};
    case "vence30":
      // Limite superior = FIM do dia +30 (BRT), senão exclui quem vence no próprio dia 30.
      return { validadeDe: hoje, validadeAte: endOfLocalDay(addDays(hoje, 30)) };
    case "vencidas":
      // "Vencida" = já passou da validade. Inclui quem vence hoje → fim do dia de ontem
      // como teto seria estrito; usamos fim de HOJE para abarcar quem expira hoje.
      return { validadeAte: endOfLocalDay(now) };
    case "idade1a2":
      return { emitidaDe: subYears(hoje, 2), emitidaAte: subYears(hoje, 1) };
    case "idade2mais":
      return { emitidaAte: subYears(hoje, 2) };
  }
}
