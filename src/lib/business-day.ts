/**
 * Se `date` cai em fim de semana (sábado/domingo, em UTC), retorna a próxima
 * segunda-feira (mesma hora). Dia útil é devolvido inalterado. Não muta a entrada.
 * Usado para não vencer boleto em fim de semana (confusão comum no BR).
 */
export function nextBusinessDay(date: Date): Date {
  const out = new Date(date.getTime());
  const day = out.getUTCDay(); // 0 = domingo, 6 = sábado
  if (day === 6) out.setUTCDate(out.getUTCDate() + 2);
  else if (day === 0) out.setUTCDate(out.getUTCDate() + 1);
  return out;
}
