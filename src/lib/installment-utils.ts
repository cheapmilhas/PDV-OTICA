import { addDays } from "date-fns";
import { Prisma } from "@prisma/client";

export interface InstallmentCalculation {
  installmentNumber: number;
  dueDate: Date;
  amount: Prisma.Decimal;
}

/**
 * Calcula valores e datas de cada parcela
 *
 * Lógica:
 * - Divide valor total pelo número de parcelas
 * - Ajusta última parcela para compensar arredondamento
 * - Calcula datas baseado em firstDueDate + interval
 *
 * @param totalAmount - Valor total a ser parcelado
 * @param count - Número de parcelas
 * @param firstDueDate - Data de vencimento da primeira parcela
 * @param intervalDays - Intervalo em dias entre parcelas (padrão: 30)
 * @returns Array com detalhes de cada parcela
 */
export function calculateInstallments(
  totalAmount: number,
  count: number,
  firstDueDate: Date,
  intervalDays: number = 30
): InstallmentCalculation[] {
  // Valor base de cada parcela (arredondado para 2 decimais)
  const baseAmount = Math.floor((totalAmount / count) * 100) / 100;

  // Calcular resto (diferença por arredondamento)
  const remainder = totalAmount - baseAmount * count;

  const installments: InstallmentCalculation[] = [];

  for (let i = 0; i < count; i++) {
    let amount = baseAmount;

    // Última parcela recebe o ajuste do resto
    if (i === count - 1) {
      amount += remainder;
    }

    // Calcular data de vencimento
    const dueDate = addDays(firstDueDate, i * intervalDays);

    installments.push({
      installmentNumber: i + 1,
      dueDate,
      amount: new Prisma.Decimal(amount.toFixed(2)),
    });
  }

  return installments;
}

/**
 * Valida limite de crédito do cliente (se aplicável)
 *
 * @param customerId - ID do cliente
 * @param requestedAmount - Valor solicitado
 * @param companyId - ID da empresa
 * @returns Objeto com aprovação e mensagem
 */
export async function validateCreditLimit(
  customerId: string,
  requestedAmount: number,
  companyId: string
): Promise<{ approved: boolean; message?: string }> {
  // TODO: Implementar se houver regra de limite de crédito por cliente
  // Por enquanto, sempre aprova
  return { approved: true };
}
