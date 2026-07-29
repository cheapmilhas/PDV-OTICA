import { SUSPEND_DAYS } from "@/lib/dunning";

/**
 * Dia de atraso a partir do qual a ESCRITA é restrita.
 *
 * 🔑 É o mesmo marco da suspensão da régua (`SUSPEND_DAYS`), de propósito: são a
 * mesma decisão vista de dois lugares. Duplicar o número aqui faria a régua e o
 * gate divergirem no dia em que alguém mudasse só um dos dois.
 *
 * ANTES desta entrega o gate restringia no dia 0 (todo `PAST_DUE` era readOnly),
 * de modo que os avisos de 3/7/14 chegavam a quem já não conseguia trabalhar.
 * Ver spec 2026-07-29 §4.6.1.
 */
export const WRITE_RESTRICTION_DAY = SUSPEND_DAYS;

/**
 * A escrita já está restrita para quem está `daysOverdue` dias em atraso?
 *
 * Pura de propósito: é a regra de negócio que decide se um cliente inadimplente
 * pode continuar operando, e precisa ser testável sem banco.
 */
export function isWriteRestricted(daysOverdue: number): boolean {
  return daysOverdue >= WRITE_RESTRICTION_DAY;
}
