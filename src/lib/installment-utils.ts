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
 * Valida limite de crédito do cliente.
 *
 * Lógica (Bug #3 fix):
 *   1. Busca Customer (creditLimit individual)
 *   2. Busca SystemRules:
 *      - customers.default_credit_limit (default R$ 500)
 *      - customers.block_overdue_sales (default true)
 *      - customers.overdue_days_to_block (default 30)
 *   3. effectiveLimit = customer.creditLimit ?? rule default
 *   4. Se block_overdue_sales:
 *        Busca AccountReceivable PENDING vencidos há > overdue_days_to_block dias
 *        Se houver: rejeita
 *   5. totalOpen = SUM(AccountReceivable PENDING.amount)
 *   6. Se (totalOpen + requestedAmount) > effectiveLimit: rejeita
 *   7. Aprovado
 *
 * Mensagens de erro são em PT-BR e mostram o limite e o débito para clareza.
 *
 * @param customerId - ID do cliente
 * @param requestedAmount - Valor que o cliente quer comprar a prazo agora
 * @param companyId - ID da empresa
 * @returns { approved, message? }
 */
export async function validateCreditLimit(
  customerId: string,
  requestedAmount: number,
  companyId: string
): Promise<{ approved: boolean; message?: string; code?: "CREDIT_LIMIT_EXCEEDED" | "CUSTOMER_OVERDUE" }> {
  // Importação dinâmica para evitar ciclos
  const { prisma } = await import("@/lib/prisma");

  // 1. Cliente
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: {
      id: true,
      name: true,
      creditLimit: true,
      creditLimitOverridden: true,
    },
  });

  if (!customer) {
    return { approved: false, message: "Cliente não encontrado." };
  }

  // 2. SystemRules — defaults documentados em /docs/audit/fixes/bug3_diagnostico.md
  const DEFAULT_LIMIT = 500;
  const DEFAULT_OVERDUE_DAYS = 30;
  const DEFAULT_BLOCK_OVERDUE = true;

  const [defaultLimitRule, blockOverdueRule, overdueDaysRule] = await Promise.all([
    prisma.systemRule.findUnique({
      where: { companyId_key: { companyId, key: "customers.default_credit_limit" } },
    }),
    prisma.systemRule.findUnique({
      where: { companyId_key: { companyId, key: "customers.block_overdue_sales" } },
    }),
    prisma.systemRule.findUnique({
      where: { companyId_key: { companyId, key: "customers.overdue_days_to_block" } },
    }),
  ]);

  const defaultLimit =
    defaultLimitRule?.active && typeof defaultLimitRule.value === "number"
      ? defaultLimitRule.value
      : DEFAULT_LIMIT;
  const blockOverdue =
    blockOverdueRule?.active && typeof blockOverdueRule.value === "boolean"
      ? blockOverdueRule.value
      : DEFAULT_BLOCK_OVERDUE;
  const overdueDays =
    overdueDaysRule?.active && typeof overdueDaysRule.value === "number"
      ? overdueDaysRule.value
      : DEFAULT_OVERDUE_DAYS;

  // 3. Limite efetivo
  const effectiveLimit = customer.creditLimit
    ? Number(customer.creditLimit)
    : defaultLimit;

  // 4. Bloqueio por inadimplência
  if (blockOverdue) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - overdueDays * 24 * 60 * 60 * 1000);

    const overdueReceivable = await prisma.accountReceivable.findFirst({
      where: {
        customerId,
        companyId,
        status: "PENDING",
        dueDate: { lt: cutoff },
      },
      orderBy: { dueDate: "asc" },
      select: { dueDate: true, amount: true, description: true },
    });

    if (overdueReceivable) {
      const daysOverdue = Math.floor(
        (now.getTime() - overdueReceivable.dueDate.getTime()) / (24 * 60 * 60 * 1000)
      );
      return {
        approved: false,
        code: "CUSTOMER_OVERDUE",
        message: `Cliente possui débito vencido há ${daysOverdue} dias (${overdueReceivable.description}, R$ ${Number(
          overdueReceivable.amount
        ).toFixed(2)}). Regularize antes de nova compra a prazo.`,
      };
    }
  }

  // 5. Total em aberto
  const openAggregate = await prisma.accountReceivable.aggregate({
    where: {
      customerId,
      companyId,
      status: "PENDING",
    },
    _sum: { amount: true },
  });
  const totalOpen = Number(openAggregate._sum.amount ?? 0);

  // 6. Verifica limite
  if (totalOpen + requestedAmount > effectiveLimit) {
    const available = Math.max(0, effectiveLimit - totalOpen);
    return {
      approved: false,
      code: "CREDIT_LIMIT_EXCEEDED",
      message: `Limite de crédito excedido. Limite: R$ ${effectiveLimit.toFixed(
        2
      )}. Em aberto: R$ ${totalOpen.toFixed(2)}. Disponível: R$ ${available.toFixed(
        2
      )}. Solicitado: R$ ${requestedAmount.toFixed(2)}.`,
    };
  }

  return { approved: true };
}
