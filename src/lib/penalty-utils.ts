import { Decimal } from "@prisma/client/runtime/library";

interface ReceivableForPenalty {
  amount: Decimal | number;
  dueDate: Date;
  finePercent?: Decimal | number | null;
  interestPercent?: Decimal | number | null;
  graceDays?: number | null;
}

interface PenaltyResult {
  fine: number;
  interest: number;
  daysLate: number;
  totalWithPenalties: number;
}

/**
 * Calcula multa e juros de uma parcela com base na data de referência.
 *
 * - Multa: percentual sobre o valor original (cobrada uma vez após carência)
 * - Juros: percentual ao mês, proporcional aos dias de atraso (pro-rata)
 */
export function calculatePenalties(
  receivable: ReceivableForPenalty,
  referenceDate: Date = new Date()
): PenaltyResult {
  const amount = Number(receivable.amount);
  const dueDate = new Date(receivable.dueDate);
  const graceDays = receivable.graceDays ?? 0;
  const finePercent = Number(receivable.finePercent ?? 0);
  const interestPercent = Number(receivable.interestPercent ?? 0);

  // Diferença em dias (truncada, sem horas)
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const refDateOnly = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const diffMs = refDateOnly.getTime() - dueDateOnly.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Não está atrasado ou dentro da carência
  if (diffDays <= graceDays) {
    return { fine: 0, interest: 0, daysLate: 0, totalWithPenalties: amount };
  }

  const daysLate = diffDays - graceDays;

  // Multa: percentual sobre o valor (cobra uma vez)
  const fine = Math.round((amount * finePercent / 100) * 100) / 100;

  // Juros: percentual ao mês, proporcional aos dias
  const monthsLate = daysLate / 30;
  const interest = Math.round((amount * interestPercent / 100 * monthsLate) * 100) / 100;

  return {
    fine,
    interest,
    daysLate,
    totalWithPenalties: Math.round((amount + fine + interest) * 100) / 100,
  };
}
