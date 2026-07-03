import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AppError, ERROR_CODES } from "@/lib/error-handler";
import { computeSellerCommission } from "./commission-engine";

/**
 * Registra a GLOSA de uma comissão paga (FU-1) — SEM descontar folha.
 *
 * Quando uma venda do mês é devolvida DEPOIS do pagamento, o pago excede o
 * devido recalculado (overpaid). O dono REGISTRA aqui quanto reconhece a glosar;
 * o sistema apenas sinaliza "a descontar no próximo fechamento". Não abate
 * automaticamente o que o vendedor recebe (decisão trabalhista do dono).
 *
 * Idempotente/seguro: só registra até o overpaid ATUAL (não deixa registrar
 * glosa maior que a divergência real). Multi-tenant por companyId.
 */
export interface RegisterClawbackParams {
  companyId: string;
  userId: string;
  year: number;
  month: number;
  byUserId: string;
}

export async function registerCommissionClawback(params: RegisterClawbackParams) {
  const { companyId, userId, year, month, byUserId } = params;

  const payment = await prisma.commissionPayment.findUnique({
    where: { companyId_userId_year_month: { companyId, userId, year, month } },
  });
  if (!payment) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "Não há pagamento de comissão para glosar neste mês.", 404);
  }

  // Overpaid ATUAL = pago − devido recalculado (piso 0). A glosa registrada é o
  // overpaid inteiro (o dono clicou reconhecendo). Não somamos ao clawback já
  // existente: registramos o valor CORRENTE devido (idempotente — clicar 2×
  // não dobra a glosa; recalcular sempre sincroniza com o estado real).
  const current = await computeSellerCommission(companyId, userId, year, month);
  const paid = new Prisma.Decimal(payment.totalCommission);
  const due = new Prisma.Decimal(current.total);
  const overpaid = paid.minus(due);

  if (overpaid.lte(0)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Não há divergência a glosar: o valor pago não excede o devido atual.",
      400,
    );
  }

  // Escrita condicional ao id + à ausência de mudança concorrente do
  // totalCommission (revisão adversarial): fecha a janela TOCTOU entre ler o
  // overpaid e gravar. Se outro processo mexeu no pagamento nesse meio, o
  // updateMany não casa e reportamos conflito em vez de gravar um valor obsoleto.
  const res = await prisma.commissionPayment.updateMany({
    where: { id: payment.id, totalCommission: payment.totalCommission },
    data: {
      clawbackAmount: overpaid,
      clawbackAt: new Date(),
      clawbackByUserId: byUserId,
    },
  });
  if (res.count === 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "O pagamento mudou durante a operação. Recarregue e tente de novo.",
      409,
    );
  }

  return { clawback: { id: payment.id }, amount: overpaid.toDecimalPlaces(2).toFixed(2) };
}
